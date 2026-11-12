import {
  useVoiceEditorTranslation,
  useVoiceEditorMessageState,
  voiceEditorErrorMessage
} from "../i18n";
import { Alert, Button, Space, Typography } from "@tsz/ui/admin/display";
import { Modal } from "@tsz/ui/admin/overlays";
import { Select } from "@tsz/ui/admin/forms";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RichTextV2 } from "@tsz/types";
import type {
  VoiceOption,
  VoicePreviewAdapter,
  VoiceProfile,
  VoiceSetting
} from "../../types";
import {
  effectiveVoiceSetting,
  isVoiceRecommendationAvailable,
  newVoiceVersionId,
  voiceEffectKey,
  voiceSettingKey
} from "../../core";
import { VoiceParameters } from "./ToolPanels";
import { VoiceConfigurationPanel } from "./VoiceConfigurationPanel";
import { useVoiceAudition } from "./useVoiceAudition";
import { AudioReview } from "./AudioReview";
import { SsmlReview } from "./SsmlReview";

export function VoiceDetail({
  setting,
  voice,
  content,
  sourceKey,
  dialect,
  phonemeLocale,
  profile,
  adapter,
  readOnly,
  canAudition,
  audioTools,
  defaultAudioAssetId,
  pendingUpload,
  onSave,
  onCancel,
  stopExternalAudio,
  unavailable,
  previousAudio = []
}: {
  setting: VoiceSetting;
  voice: VoiceOption;
  content: RichTextV2;
  sourceKey: string;
  dialect: "en-GB" | "en-US";
  phonemeLocale?: `en-${string}`;
  profile: VoiceProfile;
  adapter?: VoicePreviewAdapter;
  readOnly: boolean;
  canAudition: boolean;
  audioTools?: (stopPlayback: () => void) => ReactNode;
  defaultAudioAssetId?: string;
  pendingUpload: boolean;
  unavailable?: boolean;
  previousAudio?: VoiceSetting[];
  onSave: (setting: VoiceSetting) => void;
  onCancel: () => void;
  stopExternalAudio: () => void;
}) {
  const { t } = useVoiceEditorTranslation();
  const [draft, setDraft] = useState(() => structuredClone(setting));
  const [error, setError] = useVoiceEditorMessageState("");
  const [generating, setGenerating] = useState(false);
  const [parametersValid, setParametersValid] = useState(true);
  const generationId = useRef<{ key: string; id: string } | undefined>(
    undefined
  );
  const request = useRef<AbortController | undefined>(undefined);
  const ssmlStop = useRef<(() => void) | undefined>(undefined);
  const latest = useRef({ sourceKey, readOnly });
  latest.current = { sourceKey, readOnly };
  const catalog = useMemo(() => [voice], [voice]);
  const playbackSetting = defaultAudioAssetId
    ? { ...draft, audio_asset_id: defaultAudioAssetId }
    : draft;
  const preview = useVoiceAudition({
    open: true,
    language: "en",
    content,
    settings: [playbackSetting],
    previewAdapter: adapter,
    catalog
  });
  const effective = effectiveVoiceSetting(draft, voice);
  const available =
    !unavailable &&
    isVoiceRecommendationAvailable(
      {
        id: voiceSettingKey(draft),
        name: "",
        groupName: "",
        locale: dialect,
        setting: effective
      },
      [voice],
      dialect,
      content,
      phonemeLocale
    );
  function stop() {
    request.current?.abort();
    setGenerating(false);
    preview.stop();
    ssmlStop.current?.();
    stopExternalAudio();
  }
  useEffect(() => {
    request.current?.abort();
    setGenerating(false);
    return () => request.current?.abort();
  }, [sourceKey, content, adapter, readOnly]);
  const currentEffect = JSON.stringify([
    sourceKey,
    content,
    effective,
    readOnly
  ]);
  const effectRef = useRef(currentEffect);
  effectRef.current = currentEffect;
  async function generate() {
    if (!adapter?.generateAudio || !available || readOnly || !parametersValid)
      return;
    stop();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const baseline = effectRef.current;
    setGenerating(true);
    setError("");
    try {
      const asset = await adapter.generateAudio(
        {
          requestId:
            generationId.current?.key === baseline
              ? generationId.current.id
              : (generationId.current = {
                  key: baseline,
                  id: newVoiceVersionId()
                }).id,
          content,
          setting: draft,
          profile: {
            ...profile,
            voices: profile.voices.map((item) =>
              voiceSettingKey(item) === voiceSettingKey(draft) ? draft : item
            )
          }
        },
        { signal: controller.signal }
      );
      if (
        controller.signal.aborted ||
        baseline !== effectRef.current ||
        latest.current.readOnly
      )
        return;
      setDraft((value) => ({ ...value, audio_asset_id: asset.id }));
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(voiceEditorErrorMessage(cause, "generation_failed_try_again"));
    } finally {
      if (request.current === controller) setGenerating(false);
    }
  }
  function patch(update: Partial<VoiceSetting>) {
    if (readOnly) return;
    stop();
    request.current?.abort();
    setGenerating(false);
    setDraft((previous) => {
      const next = { ...previous, ...update };
      if (
        voiceEffectKey(effectiveVoiceSetting(previous, voice)) !==
        voiceEffectKey(effectiveVoiceSetting(next, voice))
      )
        delete next.audio_asset_id;
      return next;
    });
  }
  return (
    <Modal
      className="tsz-ve-voice-detail"
      open
      title={t("edit_voice_settings", {
        p0: dialect === "en-GB" ? t("british") : t("american"),
        p1: voice.displayName ?? voice.label
      })}
      width={1200}
      destroyOnHidden
      mask={{ closable: false }}
      onCancel={() => {
        if (!pendingUpload) {
          stop();
          onCancel();
        }
      }}
      closable={!pendingUpload}
      footer={
        <Space>
          <Button
            disabled={pendingUpload}
            onClick={() => {
              stop();
              onCancel();
            }}
          >
            {t("cancel")}
          </Button>
          <Button
            type="primary"
            disabled={
              readOnly || generating || pendingUpload || !parametersValid
            }
            onClick={() => {
              stop();
              onSave(draft);
            }}
          >
            {t("save_voice_settings")}
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary">
        {t(
          "only_this_voice_is_changed_after_saving_its_settings_save_the_text_changes"
        )}
      </Typography.Paragraph>
      <VoiceConfigurationPanel
        parameters={
          <>
            {" "}
            <Typography.Paragraph>
              <Typography.Text code copyable>
                {voice.providerVoiceId ?? voice.id}
              </Typography.Text>
            </Typography.Paragraph>
            <VoiceParameters
              voice={voice}
              setting={draft}
              readOnly={readOnly || generating}
              onChange={patch}
              onValidationChange={setParametersValid}
            />
          </>
        }
        audition={
          <div className="tsz-ve-detail-audition">
            <Space wrap className="tsz-ve-detail-actions">
              <Select
                aria-label={t("current_voice_output_format")}
                value={draft.output_format ?? "mp3"}
                disabled={readOnly || generating}
                options={[
                  { value: "mp3", label: "MP3" },
                  { value: "wav", label: "WAV" }
                ]}
                onChange={(output_format) => patch({ output_format })}
              />
              <Button
                disabled={
                  !parametersValid ||
                  !canAudition ||
                  (!available && !playbackSetting.audio_asset_id)
                }
                loading={!!preview.pendingVoiceId}
                onClick={() => {
                  if (!parametersValid) return;
                  stopExternalAudio();
                  ssmlStop.current?.();
                  preview.audition(voice, playbackSetting);
                }}
              >
                {playbackSetting.audio_asset_id
                  ? t("play_final_audio")
                  : t("audition_current_voice")}
              </Button>
              {adapter?.generateAudio && (
                <Button
                  disabled={
                    readOnly || !parametersValid || !available || generating
                  }
                  aria-busy={generating}
                  loading={generating}
                  onClick={() => void generate()}
                >
                  {t("generate_final_audio")}
                </Button>
              )}
            </Space>
            {!available && (
              <Alert
                type="warning"
                title={t(
                  voice.supportsPhoneme === false &&
                    (phonemeLocale ||
                      content.annotations.some(
                        (mark) => mark.type === "phoneme"
                      ))
                    ? "this_voice_does_not_support_specified_phonemes_select_another_voice"
                    : "the_voice_or_text_reading_is_unavailable_resolve_it_to_continue_existing_pa"
                )}
              />
            )}
            {(preview.status || error) && (
              <Typography.Paragraph role="status">
                {error || preview.status}
              </Typography.Paragraph>
            )}
            {previousAudio.map((item) => (
              <Button
                key={item.audio_asset_id}
                disabled={!adapter?.resolveAudio}
                onClick={() => {
                  stopExternalAudio();
                  ssmlStop.current?.();
                  preview.audition(voice, item);
                }}
              >
                {t("play_previous_audio")} {item.version_name ?? item.voice_id}
              </Button>
            ))}
            {preview.media && (
              <AudioReview
                media={preview.media}
                onPlay={() => {
                  stopExternalAudio();
                  ssmlStop.current?.();
                }}
              />
            )}
            {adapter?.renderSsml && available && (
              <SsmlReview
                automaticAvailable={parametersValid}
                adapter={adapter}
                content={content}
                settings={[effective]}
                singleVoice
                registerStop={(fn) => {
                  ssmlStop.current = fn;
                  return () => {
                    ssmlStop.current = undefined;
                  };
                }}
                onPlay={() => {
                  preview.stop();
                  stopExternalAudio();
                }}
              />
            )}
            {audioTools && (
              <div className="tsz-ve-detail-recordings">
                {audioTools(() => {
                  preview.stop();
                  ssmlStop.current?.();
                })}
              </div>
            )}
          </div>
        }
      />
    </Modal>
  );
}

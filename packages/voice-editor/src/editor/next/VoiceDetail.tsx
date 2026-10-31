import { Alert, Button, Modal, Select, Space, Typography } from "antd";
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
import { useVoiceAudition } from "./useVoiceAudition";
import { AudioReview } from "./AudioReview";
import { SsmlReview } from "./SsmlReview";

export function VoiceDetail({
  setting,
  voice,
  content,
  sourceKey,
  dialect,
  profile,
  adapter,
  readOnly,
  canAudition,
  audioTools,
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
  profile: VoiceProfile;
  adapter?: VoicePreviewAdapter;
  readOnly: boolean;
  canAudition: boolean;
  audioTools?: (stopPlayback: () => void) => ReactNode;
  pendingUpload: boolean;
  unavailable?: boolean;
  previousAudio?: VoiceSetting[];
  onSave: (setting: VoiceSetting) => void;
  onCancel: () => void;
  stopExternalAudio: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(setting));
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const generationId = useRef<{ key: string; id: string } | undefined>(
    undefined
  );
  const request = useRef<AbortController | undefined>(undefined);
  const ssmlStop = useRef<(() => void) | undefined>(undefined);
  const latest = useRef({ sourceKey, readOnly });
  latest.current = { sourceKey, readOnly };
  const catalog = useMemo(() => [voice], [voice]);
  const preview = useVoiceAudition({
    open: true,
    language: "en",
    content,
    settings: [draft],
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
      content
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
    if (!adapter?.generateAudio || !available || readOnly) return;
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
        setError(cause instanceof Error ? cause.message : "生成失败，请重试");
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
      open
      title={`修改${dialect === "en-GB" ? "英式" : "美式"}配音设置 · ${voice.displayName ?? voice.label}`}
      width={880}
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
            取消
          </Button>
          <Button
            type="primary"
            disabled={readOnly || generating || pendingUpload}
            onClick={() => {
              stop();
              onSave(draft);
            }}
          >
            保存配音设置
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary">
        只修改当前声音的局部草稿；保存后仍须按宿主原有流程保存正文。
      </Typography.Paragraph>
      <VoiceParameters
        voice={voice}
        setting={draft}
        readOnly={readOnly || generating}
        onChange={patch}
      />
      <Space wrap>
        <Select
          aria-label="当前音色输出格式"
          value={draft.output_format ?? "mp3"}
          disabled={readOnly || generating}
          options={[
            { value: "mp3", label: "MP3" },
            { value: "wav", label: "WAV" }
          ]}
          onChange={(output_format) => patch({ output_format })}
        />
        <Button
          disabled={!canAudition || (!available && !draft.audio_asset_id)}
          loading={!!preview.pendingVoiceId}
          onClick={() => {
            stopExternalAudio();
            ssmlStop.current?.();
            preview.audition(voice, draft);
          }}
        >
          {draft.audio_asset_id ? "播放正式音频" : "试听当前音色"}
        </Button>
        {adapter?.generateAudio && (
          <Button
            disabled={readOnly || !available || generating}
            aria-busy={generating}
            loading={generating}
            onClick={() => void generate()}
          >
            生成正式音频
          </Button>
        )}
      </Space>
      {!available && (
        <Alert
          type="warning"
          title="当前音色或正文读法不可用，请修复；原参数和标注已保留。"
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
          播放旧音频 · {item.version_name ?? item.voice_id}
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
      {adapter?.renderSsml && (
        <SsmlReview
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
      {audioTools?.(() => {
        preview.stop();
        ssmlStop.current?.();
      })}
    </Modal>
  );
}

import {
  useVoiceEditorTranslation,
  useVoiceEditorMessageState,
  createVoiceEditorMessage,
  voiceEditorErrorMessage
} from "../i18n";
import { Button, Space, Typography } from "@tsz/ui/admin/display";
import { Input, Select, Switch } from "@tsz/ui/admin/forms";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RichTextV2 } from "@tsz/types";
import type {
  VoicePreviewAdapter,
  VoicePreviewResult,
  VoiceSetting,
  SsmlDraft
} from "../../types";
import { voiceSettingKey } from "../../core";
import { AudioReview, downloadBlob, type ReviewAudio } from "./AudioReview";

export function SsmlReview({
  adapter,
  content,
  settings,
  onPlay,
  registerStop,
  singleVoice,
  expanded,
  draft,
  onDraftChange,
  automaticAvailable = true
}: {
  singleVoice?: boolean;
  expanded?: boolean;
  draft?: SsmlDraft;
  onDraftChange?: (draft: SsmlDraft) => void;
  automaticAvailable?: boolean;
  adapter: VoicePreviewAdapter;
  content: RichTextV2;
  settings: VoiceSetting[];
  onPlay: () => void;
  registerStop?: (stop: () => void) => () => void;
}) {
  const { t } = useVoiceEditorTranslation();
  const [internalOpen, setOpen] = useState(false);
  const open = expanded ?? internalOpen;
  const [version, setVersion] = useState<string>();
  const selected =
    settings.find((setting) => voiceSettingKey(setting) === version) ??
    settings.find((setting) => setting.enabled) ??
    settings[0];
  const [automatic, setAutomatic] = useState("");
  const [internalDraft, setInternalDraft] = useState<SsmlDraft>({
    manual: false
  });
  const { manual, raw } = draft ?? internalDraft;
  function changeDraft(next: SsmlDraft) {
    setInternalDraft(next);
    onDraftChange?.(next);
  }
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useVoiceEditorMessageState("");
  const [media, setMedia] = useState<ReviewAudio>();
  const active = useRef<
    { audio: HTMLAudioElement; result: VoicePreviewResult } | undefined
  >(undefined);
  const request = useRef<AbortController | undefined>(undefined);
  const inputKey = JSON.stringify([adapter.audioSourceKey, content, selected]);
  const latestKey = useRef(inputKey);
  latestKey.current = inputKey;
  const stop = useCallback(() => {
    request.current?.abort();
    request.current = undefined;
    active.current?.audio.pause();
    active.current?.result.dispose?.();
    active.current = undefined;
    setMedia(undefined);
    setPending(false);
  }, []);
  useEffect(() => registerStop?.(stop), [registerStop, stop]);
  useEffect(() => stop, [stop]);
  useEffect(() => {
    stop();
    setLoading(false);
    setAutomatic("");
    if (!open || !selected || !adapter.renderSsml || !automaticAvailable)
      return;
    const controller = new AbortController();
    setLoading(true);
    setAutomatic("");
    setError("");
    void adapter
      .renderSsml({ content, setting: selected }, { signal: controller.signal })
      .then((ssml) => {
        if (!controller.signal.aborted) setAutomatic(ssml);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(voiceEditorErrorMessage(cause, "ssml_generation_failed"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // The serialized key captures the actual source and selected version, not object identity.
  }, [open, inputKey, adapter, stop, automaticAvailable, setError]);

  const value = manual ? (raw ?? "") : automatic;
  async function preview() {
    if (
      !adapter.synthesizeSsml ||
      !selected ||
      !value ||
      (!manual && !automaticAvailable)
    )
      return;
    stop();
    onPlay();
    const controller = new AbortController();
    request.current = controller;
    const baseline = latestKey.current;
    setPending(true);
    setError("");
    try {
      const result = await adapter.synthesizeSsml(
        {
          ssml: value,
          voiceId: selected.voice_id,
          outputFormat: selected.output_format
        },
        { signal: controller.signal }
      );
      if (controller.signal.aborted || baseline !== latestKey.current) {
        result.dispose?.();
        return;
      }
      const audio = new Audio(result.audioUrl);
      active.current = { audio, result };
      setMedia({
        audio,
        result,
        name: t("ssml_audition", {
          p0: selected.version_name ?? selected.voice_id
        })
      });
      await audio.play();
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          voiceEditorErrorMessage(
            cause,
            "ssml_audition_failed_input_is_retained"
          )
        );
    } finally {
      if (request.current === controller) {
        request.current = undefined;
        setPending(false);
      }
    }
  }
  if (!open && expanded !== undefined) return null;
  if (!open)
    return (
      <Button size="small" onClick={() => setOpen(true)}>
        {t("view_ssml")}
      </Button>
    );
  return (
    <section
      className="tsz-ve-ssml-review"
      aria-label={t("ssml_audition_settings")}
    >
      <Space wrap>
        {!singleVoice && (
          <Select
            aria-label={t("ssml_voice_version")}
            value={selected && voiceSettingKey(selected)}
            options={settings.map((setting) => ({
              value: voiceSettingKey(setting),
              label: setting.version_name ?? setting.voice_id
            }))}
            onChange={(value) => {
              stop();
              setVersion(value);
              changeDraft({ manual: false });
            }}
          />
        )}
        <Switch
          checked={manual}
          disabled={!manual && ((!automatic && raw == null) || loading)}
          onChange={(checked) => {
            stop();
            changeDraft({
              manual: checked,
              raw: checked ? (raw ?? automatic) : raw
            });
          }}
          aria-label={t("edit_ssml_manually")}
        />
        <Typography.Text>{t("manual_editing")}</Typography.Text>
        <Button
          size="small"
          onClick={() => {
            stop();
            changeDraft({ manual: false });
          }}
        >
          {t("restore_automatic_generation")}
        </Button>
        {expanded === undefined && (
          <Button
            size="small"
            onClick={() => {
              stop();
              changeDraft({ manual: false });
              setOpen(false);
            }}
          >
            {t("hide_ssml")}
          </Button>
        )}
      </Space>
      <Input.TextArea
        aria-label={t("ssml_source")}
        value={value}
        readOnly={!manual}
        autoSize={{ minRows: 4, maxRows: 10 }}
        maxLength={32000}
        onChange={(event) => {
          stop();
          changeDraft({ manual: true, raw: event.target.value });
        }}
      />
      {!manual && !automaticAvailable && (
        <Typography.Text type="secondary">
          {t("enter_valid_parameters_before_generating_ssml_automatically")}
        </Typography.Text>
      )}
      <Space wrap>
        <Button
          size="small"
          disabled={
            !value ||
            loading ||
            !adapter.synthesizeSsml ||
            (!manual && !automaticAvailable)
          }
          loading={pending}
          onClick={() => void preview()}
        >
          {t("audition_ssml")}
        </Button>
        <Button
          size="small"
          disabled={!value}
          onClick={() => {
            void navigator.clipboard
              .writeText(value)
              .catch(() =>
                setError(
                  createVoiceEditorMessage(
                    "copy_failed_copy_the_source_manually"
                  )
                )
              );
          }}
        >
          {t("copy_ssml")}
        </Button>
        <Button
          size="small"
          disabled={!value}
          onClick={() =>
            downloadBlob(
              new Blob([value], { type: "application/ssml+xml;charset=utf-8" }),
              "speech.ssml"
            )
          }
        >
          {t("download_ssml")}
        </Button>
      </Space>
      <Typography.Text type="secondary">
        {t("manual_changes_apply_only_to_this_ssml_audition")}
      </Typography.Text>
      {loading && (
        <Typography.Text type="secondary">
          {t("generating_ssml")}
        </Typography.Text>
      )}
      {error && <Typography.Text type="danger">{error}</Typography.Text>}
      {media && (
        <AudioReview
          key={media.result.audioUrl}
          media={media}
          onPlay={onPlay}
        />
      )}
    </section>
  );
}

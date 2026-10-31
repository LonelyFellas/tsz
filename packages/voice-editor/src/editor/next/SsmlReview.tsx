import { Button, Input, Select, Space, Switch, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RichTextV2 } from "@tsz/types";
import type {
  VoicePreviewAdapter,
  VoicePreviewResult,
  VoiceSetting
} from "../../types";
import { voiceSettingKey } from "../../core";
import { AudioReview, downloadBlob, type ReviewAudio } from "./AudioReview";

export function SsmlReview({
  adapter,
  content,
  settings,
  onPlay,
  registerStop,
  singleVoice
}: {
  singleVoice?: boolean;
  adapter: VoicePreviewAdapter;
  content: RichTextV2;
  settings: VoiceSetting[];
  onPlay: () => void;
  registerStop?: (stop: () => void) => () => void;
}) {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState<string>();
  const selected =
    settings.find((setting) => voiceSettingKey(setting) === version) ??
    settings.find((setting) => setting.enabled) ??
    settings[0];
  const [automatic, setAutomatic] = useState("");
  const [manual, setManual] = useState(false);
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
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
    if (!open || !selected || !adapter.renderSsml) return;
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
          setError(cause instanceof Error ? cause.message : "SSML 生成失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // The serialized key captures the actual source and selected version, not object identity.
  }, [open, inputKey, adapter, stop]);

  const value = manual ? raw : automatic;
  async function preview() {
    if (!adapter.synthesizeSsml || !selected || !value) return;
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
        name: `${selected.version_name ?? selected.voice_id} SSML 试听`
      });
      await audio.play();
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "SSML 试听失败，输入已保留"
        );
    } finally {
      if (request.current === controller) {
        request.current = undefined;
        setPending(false);
      }
    }
  }
  if (!open)
    return (
      <Button size="small" onClick={() => setOpen(true)}>
        查看 SSML
      </Button>
    );
  return (
    <section className="tsz-ve-ssml-review" aria-label="SSML 试听设置">
      <Space wrap>
        {!singleVoice && (
          <Select
            aria-label="SSML 配音版本"
            value={selected && voiceSettingKey(selected)}
            options={settings.map((setting) => ({
              value: voiceSettingKey(setting),
              label: setting.version_name ?? setting.voice_id
            }))}
            onChange={(value) => {
              stop();
              setVersion(value);
              setManual(false);
              setRaw("");
            }}
          />
        )}
        <Switch
          checked={manual}
          disabled={!automatic || loading}
          onChange={(checked) => {
            stop();
            if (checked) setRaw(automatic);
            setManual(checked);
          }}
          aria-label="手动编辑 SSML"
        />
        <Typography.Text>手动编辑</Typography.Text>
        <Button
          size="small"
          onClick={() => {
            stop();
            setManual(false);
            setRaw("");
          }}
        >
          恢复自动生成
        </Button>
        <Button
          size="small"
          onClick={() => {
            stop();
            setManual(false);
            setRaw("");
            setOpen(false);
          }}
        >
          收起 SSML
        </Button>
      </Space>
      <Input.TextArea
        aria-label="SSML 原文"
        value={value}
        readOnly={!manual}
        autoSize={{ minRows: 4, maxRows: 10 }}
        maxLength={32000}
        onChange={(event) => {
          stop();
          setRaw(event.target.value);
        }}
      />
      <Space wrap>
        <Button
          size="small"
          disabled={!value || loading || !adapter.synthesizeSsml}
          loading={pending}
          onClick={() => void preview()}
        >
          试听 SSML
        </Button>
        <Button
          size="small"
          disabled={!value}
          onClick={() => {
            void navigator.clipboard
              .writeText(value)
              .catch(() => setError("复制失败，请手动复制原文"));
          }}
        >
          复制 SSML
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
          下载 SSML
        </Button>
      </Space>
      <Typography.Text type="secondary">
        手动 SSML 仅用于本次试听，完成编辑时不写入正文配音配置。
      </Typography.Text>
      {loading && (
        <Typography.Text type="secondary">正在生成 SSML…</Typography.Text>
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

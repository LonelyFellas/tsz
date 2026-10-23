import { useEffect, useRef, useState } from "react";
import { Button, Space, Typography } from "antd";
import { SoundOutlined } from "@ant-design/icons";
import type { WordlistAudioLocale, WordlistCustomAudio } from "@tsz/types";
import { api } from "@/lib/auth";

export function CustomAudio({
  listId,
  requestId,
  audio
}: {
  listId: string;
  requestId?: string;
  audio: WordlistCustomAudio;
}) {
  const [busy, setBusy] = useState<WordlistAudioLocale | null>(null);
  const [error, setError] = useState(false);
  const request = useRef<AbortController | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      if (player.current) {
        player.current.onerror = null;
        player.current.pause();
      }
    },
    []
  );
  async function play(locale: WordlistAudioLocale) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(locale);
    setError(false);
    try {
      player.current?.pause();
      const signed = await (requestId
        ? api.wordlists.reviewCustomAudioUrl(
            listId,
            requestId,
            audio.item_id,
            locale,
            { signal: controller.signal }
          )
        : api.wordlists.customAudioUrl(listId, audio.item_id, locale, {
            signal: controller.signal
          }));
      if (controller.signal.aborted) return;
      const element = new Audio(signed.url);
      player.current = element;
      element.onerror = () => {
        if (!controller.signal.aborted) setError(true);
      };
      await element.play();
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setBusy(null);
      if (request.current === controller) request.current = null;
    }
  }
  if (audio.status !== "ready")
    return (
      <Typography.Text type="secondary">
        {
          {
            queued: "语音等待生成",
            processing: "语音生成中",
            refunding: "退款处理中",
            refunded: "已退款"
          }[audio.status]
        }
      </Typography.Text>
    );
  return (
    <Space wrap>
      {audio.locales.map((locale) => (
        <Button
          key={locale}
          icon={<SoundOutlined />}
          loading={busy === locale}
          disabled={!!busy}
          onClick={() => void play(locale)}
        >
          {locale === "en-GB" ? "播放英式语音" : "播放美式语音"}
        </Button>
      ))}
      {error && (
        <Typography.Text type="danger" role="alert">
          播放失败，请重试
        </Typography.Text>
      )}
    </Space>
  );
}

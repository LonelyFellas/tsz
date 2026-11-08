import { useContentTranslation } from "@/features/content/i18n";
import { useEffect, useRef, useState } from "react";
import { Button, Space, Typography } from "@tsz/ui/admin/display";
import { Volume2Icon } from "lucide-react";
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
  const { t } = useContentTranslation();
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
            queued: t("audio_queued"),
            processing: t("audio_processing"),
            refunding: t("refunding"),
            refunded: t("refunded")
          }[audio.status]
        }
      </Typography.Text>
    );
  return (
    <Space wrap>
      {audio.locales.map((locale) => (
        <Button
          key={locale}
          icon={<Volume2Icon />}
          loading={busy === locale}
          disabled={!!busy}
          onClick={() => void play(locale)}
        >
          {locale === "en-GB" ? t("play_british") : t("play_american")}
        </Button>
      ))}
      {error && (
        <Typography.Text type="danger" role="alert">
          {t("play_failed")}
        </Typography.Text>
      )}
    </Space>
  );
}

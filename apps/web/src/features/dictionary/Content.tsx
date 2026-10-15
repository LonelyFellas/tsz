"use client";
import "@tsz/voice-editor/styles.css";
import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import { Button } from "@tsz/ui/components";
import type { DictionaryAudio, EnglishVariant, WordlistText } from "@tsz/types";
import { api } from "@/lib/request";
import { selectTexts } from "@/features/wordlist/reading";

export function Texts({
  texts,
  variant
}: {
  texts: WordlistText[];
  variant: EnglishVariant | null;
}) {
  return (
    <div className="space-y-1 break-words">
      {selectTexts(texts, variant).map((t, i) => (
        <RichTextReadOnly key={`${t.dialect}:${i}`} value={t.content} />
      ))}
    </div>
  );
}
export function AudioButton({
  entryId,
  audio,
  label
}: {
  entryId: string;
  audio: DictionaryAudio;
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const player = useRef<HTMLAudioElement | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      player.current?.pause();
    },
    []
  );
  async function play() {
    if (busy) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(false);
    try {
      player.current?.pause();
      const signed = await api.dictionary.audio(entryId, audio.asset_id, {
        signal: controller.signal
      });
      if (controller.signal.aborted) return;
      const element = new Audio(signed.url);
      player.current = element;
      element.onerror = () => setError(true);
      await element.play();
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={busy}
        aria-label={label}
        onClick={() => void play()}
      >
        <Volume2 className="size-4" aria-hidden />
      </Button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          播放失败，请重试
        </span>
      )}
    </span>
  );
}
export function preferredAudio(
  audio: DictionaryAudio[],
  targetId: string,
  variant: EnglishVariant | null
) {
  const candidates = audio.filter((a) => a.target_id === targetId);
  const locale = variant === "AmE" ? "en-US" : "en-GB";
  return candidates.find((a) => a.locale === locale) ?? candidates[0];
}

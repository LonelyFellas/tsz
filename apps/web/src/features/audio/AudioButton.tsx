"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { Button } from "@tsz/ui/components";

export function AudioButton({
  label,
  sign
}: {
  label: string;
  sign: (signal: AbortSignal) => Promise<{ url: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const player = useRef<HTMLAudioElement | null>(null);
  const request = useRef<AbortController | null>(null);
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
  async function play() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(false);
    try {
      player.current?.pause();
      const signed = await sign(controller.signal);
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
      if (!controller.signal.aborted) setBusy(false);
      if (request.current === controller) request.current = null;
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

"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { Button } from "@tsz/ui/components";
import { authRuntime } from "@/lib/auth";

interface AudioButtonProps {
  label: string;
  sign: (signal: AbortSignal) => Promise<{ url: string; expires_at?: string }>;
  resourceKey?: string;
}

export function AudioButton(props: AudioButtonProps) {
  return <AudioPlayback key={props.resourceKey} {...props} />;
}

function AudioPlayback({ label, sign, resourceKey }: AudioButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const player = useRef<HTMLAudioElement | null>(null);
  const request = useRef<AbortController | null>(null);
  const cached = useRef<{
    key: string;
    session: number;
    url: string;
    expires: number;
  } | null>(null);
  useEffect(() => {
    return () => {
      request.current?.abort();
      request.current = null;
      cached.current = null;
      if (player.current) {
        player.current.onerror = null;
        player.current.pause();
        player.current = null;
      }
    };
  }, []);
  async function play() {
    if (request.current) return;
    const controller = new AbortController();
    const session = authRuntime.tokens.getSessionGeneration();
    request.current = controller;
    setBusy(true);
    setError(false);
    try {
      if (player.current) {
        player.current.onerror = null;
        player.current.pause();
      }
      const previous = cached.current;
      const signed =
        resourceKey &&
        previous?.key === resourceKey &&
        previous.session === session &&
        previous.expires > Date.now() + 5_000
          ? previous
          : await sign(controller.signal);
      if (
        controller.signal.aborted ||
        authRuntime.tokens.getSessionGeneration() !== session
      )
        return;
      if (resourceKey && "expires_at" in signed && signed.expires_at) {
        const expires = Date.parse(signed.expires_at);
        cached.current = Number.isFinite(expires)
          ? {
              key: resourceKey,
              session,
              url: signed.url,
              expires: Math.min(expires, Date.now() + 15 * 60_000)
            }
          : null;
      }
      const element = new Audio(signed.url);
      player.current = element;
      element.onerror = () => {
        if (!controller.signal.aborted && player.current === element) {
          cached.current = null;
          setError(true);
        }
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

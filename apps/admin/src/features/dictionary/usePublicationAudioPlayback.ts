import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicationAudioRequirement } from "@tsz/types";
import { api } from "@/lib/auth";

export type PublicationAudioResolver = (
  assetId: string,
  signal: AbortSignal
) => Promise<{ url: string }>;
const resolveAsset: PublicationAudioResolver = (id, signal) =>
  api.audioAssets.url(id, signal);
let stopActiveReview: (() => void) | undefined;

export function usePublicationAudioPlayback(
  items: readonly PublicationAudioRequirement[],
  onFailure: (message: string) => void,
  resolveAudio: PublicationAudioResolver = resolveAsset
) {
  const [playing, setPlaying] = useState<number>();
  const playback = useRef<AbortController | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const failureCallback = useRef(onFailure);
  failureCallback.current = onFailure;
  const stop = useCallback(() => {
    playback.current?.abort();
    player.current?.pause();
  }, []);
  useEffect(() => () => stop(), [stop]);
  async function audition(indices: number[]) {
    stopActiveReview?.();
    stop();
    const controller = new AbortController();
    playback.current = controller;
    const stopThis = () => {
      controller.abort();
      player.current?.pause();
    };
    stopActiveReview = stopThis;
    const seen = new Set<string>();
    try {
      for (const index of indices) {
        const item = items[index];
        if (!item?.asset_id || item.issue || seen.has(item.asset_id)) continue;
        seen.add(item.asset_id);
        setPlaying(index);
        const signed = await resolveAudio(item.asset_id, controller.signal);
        if (controller.signal.aborted) return;
        const audio = new Audio(signed.url);
        player.current = audio;
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            audio.onended = null;
            audio.onerror = null;
            controller.signal.removeEventListener("abort", cancelled);
          };
          const cancelled = () => {
            cleanup();
            resolve();
          };
          audio.onended = () => {
            cleanup();
            resolve();
          };
          audio.onerror = () => {
            cleanup();
            reject(new Error("正式音频加载失败，请重新检查"));
          };
          controller.signal.addEventListener("abort", cancelled, {
            once: true
          });
          void audio.play().catch((failure) => {
            cleanup();
            reject(failure);
          });
        });
        if (controller.signal.aborted) return;
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        failureCallback.current(
          failure instanceof Error ? failure.message : "音频播放失败，请重试"
        );
      }
    } finally {
      if (playback.current === controller) {
        playback.current = null;
        setPlaying(undefined);
      }
      if (stopActiveReview === stopThis) stopActiveReview = undefined;
    }
  }

  return { playing, stop, audition };
}

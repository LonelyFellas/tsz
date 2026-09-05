import { useCallback, useEffect, useRef, useState } from "react";
import type { RichTextV2 } from "@tsz/types";
import { canonicalVoiceHash } from "../../core";
import type {
  VoiceOption,
  VoicePreviewAdapter,
  VoicePreviewResult,
  VoiceSettings
} from "../../types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "试听失败，请稍后重试";
}

/**
 * 语速是全局设置，但每个音色各有 rateRange。试听前按目标音色夹取，
 * 免得把越界的 prosody rate 送出去被后端拒绝。未声明范围的音色不夹。
 */
function settingsForVoice(
  settings: Omit<VoiceSettings, "voiceId">,
  voice: VoiceOption
): VoiceSettings {
  const { rateRange } = voice;
  const rate = settings.ratePercent;
  const ratePercent =
    rateRange && rate !== undefined
      ? Math.min(Math.max(rate, rateRange.min), rateRange.max)
      : rate;
  return { ...settings, ratePercent, voiceId: voice.id };
}

export interface VoiceAuditionInput {
  open: boolean;
  language: string;
  content: RichTextV2;
  /** 语速等全局参数；参与 hash，改动后已播的音频即失效。 */
  settings: Omit<VoiceSettings, "voiceId">;
  previewAdapter?: VoicePreviewAdapter;
}

export interface VoiceAudition {
  voices: VoiceOption[];
  voicesLoading: boolean;
  status: string;
  /** 正在合成的音色；同一时刻至多一个。 */
  pendingVoiceId?: string;
  /** 正在播放的音色。 */
  playingVoiceId?: string;
  audition: (voice: VoiceOption) => void;
  stop: () => void;
}

/**
 * 逐音色试听。相较旧版「选发音人 + 生成试听」，这里同一时刻只允许一路合成与
 * 播放：点新音色会中止在飞的请求、停掉在放的音频。
 *
 * 沿用旧实现里几条来之不易的约束：
 * - 请求带 AbortController，抽屉关闭 / 卸载 / 换音色一律中止；
 * - 以内容+参数的 hash 判定过期，回包时 hash 已变则丢弃并 dispose，避免旧音频
 *   冒充新内容；
 * - audio 元素用「身份比对」守卫回调，异步事件不会打到已被替换的那一个；
 * - 浏览器拒绝自动播放时降级为可点重播，不报成错误。
 */
export function useVoiceAudition({
  open,
  language,
  content,
  settings,
  previewAdapter
}: VoiceAuditionInput): VoiceAudition {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [pendingVoiceId, setPendingVoiceId] = useState<string>();
  const [playingVoiceId, setPlayingVoiceId] = useState<string>();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resultRef = useRef<VoicePreviewResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestHashRef = useRef("");

  const currentHash = canonicalVoiceHash(content, settings);

  const stopMedia = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    resultRef.current?.dispose?.();
    resultRef.current = null;
    setPlayingVoiceId(undefined);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPendingVoiceId(undefined);
    stopMedia();
  }, [stopMedia]);

  // 抽屉关闭即收干净，避免关掉后音频还在响、请求还在飞。
  useEffect(() => {
    if (open) return;
    stop();
    setStatus("");
  }, [open, stop]);

  useEffect(() => stop, [stop]);

  // 正文或语速一变，已播/在飞的音频就不再代表当前内容，直接作废。
  // stop 是恒定引用（依赖链到底都是空依赖的 useCallback），进依赖数组不会多跑。
  useEffect(() => {
    if (!audioRef.current && !abortRef.current) return;
    stop();
    setStatus("内容或语音参数已变化，请重新试听");
  }, [currentHash, stop]);

  useEffect(() => {
    if (!open || !previewAdapter) {
      setVoices([]);
      return;
    }
    const controller = new AbortController();
    setVoicesLoading(true);
    previewAdapter
      .listVoices({ language, signal: controller.signal })
      .then((items) => {
        if (controller.signal.aborted) return;
        setVoices(items);
        setStatus(items.length > 0 ? "" : "暂无可用发音人");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setStatus(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setVoicesLoading(false);
      });
    return () => controller.abort();
  }, [language, open, previewAdapter]);

  const audition = useCallback(
    (voice: VoiceOption) => {
      if (!previewAdapter || !content.text.trim()) return;
      stop();

      const controller = new AbortController();
      abortRef.current = controller;
      const voiceSettings = settingsForVoice(settings, voice);
      const requestHash = canonicalVoiceHash(content, voiceSettings);
      requestHashRef.current = requestHash;
      setPendingVoiceId(voice.id);
      setStatus(`正在合成 ${voice.label}…`);

      void previewAdapter
        .synthesize(
          { language, content, ...voiceSettings },
          { signal: controller.signal }
        )
        .then((result) => {
          if (
            controller.signal.aborted ||
            requestHashRef.current !== requestHash
          ) {
            result.dispose?.();
            return;
          }
          resultRef.current = result;

          const audio = new Audio(result.audioUrl);
          audioRef.current = audio;
          const isCurrent = () => audioRef.current === audio;

          audio.addEventListener(
            "error",
            () => {
              if (!isCurrent()) return;
              stopMedia();
              setStatus("试听音频加载失败，请重新试听");
            },
            { once: true }
          );
          audio.addEventListener(
            "ended",
            () => {
              if (!isCurrent()) return;
              setPlayingVoiceId(undefined);
              setStatus(result.cached ? "试听完毕（缓存）" : "试听完毕");
            },
            { once: true }
          );

          return audio
            .play()
            .then(() => {
              if (!isCurrent()) return;
              setPlayingVoiceId(voice.id);
              setStatus(
                result.cached
                  ? `播放中 ${voice.label}（缓存）`
                  : `播放中 ${voice.label}`
              );
            })
            .catch(() => {
              if (!isCurrent()) return;
              setStatus("浏览器阻止了自动播放，请再点一次试听");
            });
        })
        .catch((error) => {
          if (!controller.signal.aborted) setStatus(errorMessage(error));
        })
        .finally(() => {
          if (abortRef.current === controller) {
            abortRef.current = null;
            setPendingVoiceId(undefined);
          }
        });
    },
    [content, language, previewAdapter, settings, stop, stopMedia]
  );

  return {
    voices,
    voicesLoading,
    status,
    pendingVoiceId,
    playingVoiceId,
    audition,
    stop
  };
}

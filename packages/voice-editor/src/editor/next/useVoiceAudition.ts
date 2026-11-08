import {
  useVoiceEditorMessageState,
  createVoiceEditorMessage,
  voiceEditorErrorMessage
} from "../i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RichTextV2 } from "@tsz/types";
import type { ReviewAudio } from "./AudioReview";
import {
  canonicalVoiceHash,
  voiceSettingFor,
  voiceSettingKey,
  effectiveVoiceSetting
} from "../../core";
import type {
  VoiceOption,
  VoicePreviewAdapter,
  VoicePreviewResult,
  VoiceSettings,
  VoiceSetting
} from "../../types";

/** 试听使用该音色自己的语速，并按供应商能力夹取。 */
function settingsForVoice(
  settings: readonly VoiceSetting[],
  voice: VoiceOption,
  versionKey?: string
): VoiceSettings {
  const stored = voiceSettingFor(settings, voice.id, versionKey);
  const raw = stored ?? {
    voice_id: voice.id,
    enabled: false,
    rate_percent: 0,
    ...voice.defaultSettings
  };
  const setting = effectiveVoiceSetting(raw, voice);
  const rate = setting?.rate_percent ?? 0;
  const ratePercent =
    voice.supportsRate === false
      ? rate
      : voice.rateRange
        ? Math.min(Math.max(rate, voice.rateRange.min), voice.rateRange.max)
        : rate;
  return {
    voiceId: voice.id,
    ...(stored?.output_format ? { outputFormat: stored.output_format } : {}),
    ratePercent,
    ...(setting?.pitch_semitones !== undefined
      ? { pitchSemitones: setting.pitch_semitones }
      : {}),
    ...(setting?.volume_percent !== undefined
      ? { volumePercent: setting.volume_percent }
      : {}),
    ...(setting?.style ? { style: setting.style } : {}),
    ...(setting?.style_degree !== undefined
      ? { styleDegree: setting.style_degree }
      : {}),
    ...(setting?.role !== undefined ? { role: setting.role } : {})
  };
}

export interface VoiceAuditionInput {
  open: boolean;
  language: string;
  content: RichTextV2;
  /** 每个音色各自的设置；未配置的音色使用原速。 */
  settings: readonly VoiceSetting[];
  previewAdapter?: VoicePreviewAdapter;
  catalog?: VoiceOption[];
}

export interface VoiceAudition {
  media?: ReviewAudio;
  voices: VoiceOption[];
  voicesLoading: boolean;
  status: string;
  /** 正在合成的音色；同一时刻至多一个。 */
  pendingVoiceId?: string;
  /** 正在播放的音色。 */
  playingVoiceId?: string;
  audition: (
    voice: VoiceOption,
    setting?: VoiceSetting,
    fallback?: RichTextV2
  ) => void;
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
  previewAdapter,
  catalog
}: VoiceAuditionInput): VoiceAudition {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [status, setStatus] = useVoiceEditorMessageState("");
  const [pendingVoiceId, setPendingVoiceId] = useState<string>();
  const [playingVoiceId, setPlayingVoiceId] = useState<string>();
  const [media, setMedia] = useState<ReviewAudio>();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resultRef = useRef<VoicePreviewResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestHashRef = useRef("");

  const activeVoiceRef = useRef<VoiceOption | undefined>(undefined);
  const activeVersionRef = useRef<string | undefined>(undefined);
  const activeAssetRef = useRef<string | undefined>(undefined);
  const fallbackRef = useRef<RichTextV2 | undefined>(undefined);

  const stopMedia = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setMedia(undefined);
    resultRef.current?.dispose?.();
    resultRef.current = null;
    setPlayingVoiceId(undefined);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    activeVoiceRef.current = undefined;
    fallbackRef.current = undefined;
    setPendingVoiceId(undefined);
    setStatus("");
    stopMedia();
  }, [stopMedia]);

  // 抽屉关闭即收干净，避免关掉后音频还在响、请求还在飞。
  useEffect(() => {
    if (open) return;
    stop();
    setStatus("");
  }, [open, stop]);

  useEffect(() => stop, [stop, previewAdapter]);

  // 正文或语速一变，已播/在飞的音频就不再代表当前内容，直接作废。
  // stop 是恒定引用（依赖链到底都是空依赖的 useCallback），进依赖数组不会多跑。
  useEffect(() => {
    if (!audioRef.current && !abortRef.current) return;
    const voice = activeVoiceRef.current;
    if (
      voice &&
      activeAssetRef.current ===
        voiceSettingFor(settings, voice.id, activeVersionRef.current)
          ?.audio_asset_id &&
      requestHashRef.current ===
        canonicalVoiceHash(
          content.text.trim() ? content : (fallbackRef.current ?? content),
          settingsForVoice(settings, voice, activeVersionRef.current)
        )
    )
      return;
    stop();
    setStatus(
      createVoiceEditorMessage(
        "content_or_voice_parameters_changed_audition_again"
      )
    );
  }, [content, settings, stop]);

  useEffect(() => {
    if (catalog) {
      setVoices(catalog);
      return;
    }
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
        setStatus(
          items.length > 0
            ? ""
            : createVoiceEditorMessage("no_speakers_available")
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setStatus(
            voiceEditorErrorMessage(error, "audition_failed_try_again_later")
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setVoicesLoading(false);
      });
    return () => controller.abort();
  }, [language, open, previewAdapter, catalog]);

  const audition = useCallback(
    (voice: VoiceOption, setting?: VoiceSetting, fallback?: RichTextV2) => {
      const previewContent = content.text.trim()
        ? content
        : (fallback ?? content);
      if (!previewAdapter || !previewContent.text.trim()) return;
      stop();
      fallbackRef.current = content.text.trim() ? undefined : fallback;

      const existing = setting ?? voiceSettingFor(settings, voice.id);
      if (
        !existing?.audio_asset_id &&
        previewContent.annotations.some(
          (mark) =>
            (mark.type === "pause" && voice.supportsPause === false) ||
            (mark.type === "phoneme" && voice.supportsPhoneme === false) ||
            (mark.type === "sub" && voice.supportsSub === false) ||
            (mark.type === "say_as" && voice.supportsSayAs === false)
        )
      ) {
        setStatus(
          createVoiceEditorMessage(
            "this_model_does_not_support_the_current_parameters_pauses_or_phonemes_adjus_2"
          )
        );
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      activeVoiceRef.current = voice;
      activeVersionRef.current = setting ? voiceSettingKey(setting) : undefined;
      const voiceSettings = settingsForVoice(
        setting ? [setting] : settings,
        voice,
        activeVersionRef.current
      );
      const requestHash = canonicalVoiceHash(previewContent, voiceSettings);
      requestHashRef.current = requestHash;
      setPendingVoiceId(voice.id);
      const stored = setting ?? voiceSettingFor(settings, voice.id);
      activeAssetRef.current = stored?.audio_asset_id;
      setStatus(
        stored?.audio_asset_id
          ? createVoiceEditorMessage("loading_final_audio", { p0: voice.label })
          : createVoiceEditorMessage("synthesising", { p0: voice.label })
      );
      const result =
        stored?.audio_asset_id && previewAdapter.resolveAudio
          ? previewAdapter.resolveAudio(stored.audio_asset_id, {
              signal: controller.signal
            })
          : (!content.text.trim() && fallback && previewAdapter.synthesizeSample
              ? previewAdapter.synthesizeSample.bind(previewAdapter)
              : previewAdapter.synthesize.bind(previewAdapter))(
              { language, content: previewContent, ...voiceSettings },
              { signal: controller.signal }
            );
      void result
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
          setMedia({
            audio,
            result,
            name: setting?.version_name ?? voice.label
          });
          const isCurrent = () => audioRef.current === audio;

          audio.addEventListener(
            "error",
            () => {
              if (!isCurrent()) return;
              stopMedia();
              setStatus(
                createVoiceEditorMessage(
                  "could_not_load_audition_audio_audition_again"
                )
              );
            },
            { once: true }
          );
          audio.addEventListener(
            "ended",
            () => {
              if (!isCurrent()) return;
              setPlayingVoiceId(undefined);
              setStatus(
                result.cached
                  ? createVoiceEditorMessage("audition_complete_cached")
                  : createVoiceEditorMessage("audition_complete")
              );
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
                  ? createVoiceEditorMessage("playing_cached", {
                      p0: voice.label
                    })
                  : createVoiceEditorMessage("playing", { p0: voice.label })
              );
            })
            .catch(() => {
              if (!isCurrent()) return;
              setStatus(
                createVoiceEditorMessage(
                  "the_browser_blocked_autoplay_click_audition_again"
                )
              );
            });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setStatus(
              voiceEditorErrorMessage(error, "audition_failed_try_again_later")
            );
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
    media,
    voices,
    voicesLoading,
    status,
    pendingVoiceId,
    playingVoiceId,
    audition,
    stop
  };
}

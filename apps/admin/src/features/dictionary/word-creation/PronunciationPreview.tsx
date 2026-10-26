import { speechAccentGroup } from "@tsz/shared";
import { DownOutlined, SoundOutlined, SyncOutlined } from "@ant-design/icons";
import { App, Button, Popover, Space, Tag, Tooltip } from "antd";
import type { Dialect, RichTextV2, VoiceProfileV3 } from "@tsz/types";
import type { AdminDialectPreference } from "@tsz/shared";
import { retainResolvedAudio, voiceSettingFor } from "@tsz/voice-editor/core";
import { useDialectPreference } from "@/features/settings/useDialectPreference";
import type {
  VoiceOption,
  VoicePreviewAdapter,
  VoicePreviewResult,
  VoiceSetting
} from "@tsz/voice-editor/types";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { env } from "@/lib/env";
import { DIALECT_SHORT_LABEL } from "../editorConstants";
import {
  adminVoicePreviewAdapter,
  voicePreviewIsMock
} from "../voice-editor/dataSource";

interface PreviewContextValue {
  claimPlayback: (stop: () => void) => void;
  releasePlayback: (stop: () => void) => void;
  enabled: boolean;
  voices: VoiceOption[];
  voicesLoading: boolean;
  voicesError: string;
  /** 统一内容按管理员偏好挑发音人；在 Provider 里取一次，别让每个控件各自订阅。 */
  dialectPreference: AdminDialectPreference;
  adapter: VoicePreviewAdapter;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "试听请求失败，请重试";
}

export function PronunciationPreviewProvider({
  children,
  readOnly = false
}: {
  children: ReactNode;
  readOnly?: boolean;
}) {
  const activePlayback = useRef<(() => void) | null>(null);
  const claimPlayback = useCallback((stop: () => void) => {
    if (activePlayback.current !== stop) activePlayback.current?.();
    activePlayback.current = stop;
  }, []);
  const releasePlayback = useCallback((stop: () => void) => {
    if (activePlayback.current === stop) activePlayback.current = null;
  }, []);
  const enabled = env.VOICE_PREVIEW && !readOnly;
  const { preference: dialectPreference } = useDialectPreference();
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState("");

  useEffect(() => {
    if (!enabled) {
      setVoices([]);
      setVoicesLoading(false);
      setVoicesError("");
      return;
    }
    const controller = new AbortController();
    setVoicesLoading(true);
    setVoicesError("");
    adminVoicePreviewAdapter
      .listVoices({ language: "en", signal: controller.signal })
      .then((items) => {
        if (controller.signal.aborted) return;
        setVoices(items);
        if (items.length === 0) setVoicesError("暂无可用发音人");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setVoicesError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setVoicesLoading(false);
      });
    return () => controller.abort();
  }, [enabled]);

  const value = useMemo(
    () => ({
      claimPlayback,
      releasePlayback,
      enabled,
      voices,
      voicesLoading,
      voicesError,
      dialectPreference,
      adapter: adminVoicePreviewAdapter
    }),
    [
      claimPlayback,
      releasePlayback,
      dialectPreference,
      enabled,
      voices,
      voicesError,
      voicesLoading
    ]
  );
  return (
    <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>
  );
}

function localeForDialect(
  dialect: Dialect,
  preference: AdminDialectPreference
): string | undefined {
  // 统一内容没有自己的方言，按管理员偏好挑发音人（需求：试听也按偏好选发音人）。
  if (dialect === "common") return preference === "uk" ? "en-GB" : "en-US";
  if (dialect === "uk") return "en-GB";
  if (dialect === "us") return "en-US";
  return undefined;
}

function voiceForDialect(
  voices: VoiceOption[],
  dialect: Dialect,
  preference: AdminDialectPreference
): VoiceOption | undefined {
  const locale = localeForDialect(dialect, preference);
  // 扩大供应商目录后仍优先沿用已有默认发音人，缺席时再按目录顺序回退。
  const preferredIds =
    locale === "en-GB"
      ? ["en-gb-sonia", "en-gb-sonianeural"]
      : ["en-us-aria", "en-us-arianeural"];
  const matched = locale
    ? (voices.find(
        (voice) => voice.locale === locale && preferredIds.includes(voice.id)
      ) ?? voices.find((voice) => voice.locale === locale))
    : undefined;
  // Common content also resolves to an explicit locale; never cross accents to keep playback enabled.
  return matched;
}

/**
 * 当前页面缺少哪一侧发音人的常驻说明。
 *
 * 目录里没有匹配 locale 的 voice 时「获取语音」只会禁用，原因过去只挂在悬停
 * Tooltip 上，用户不悬停就看不到；这里给页面一句可直接读到的说明。
 */
export function usePronunciationVoiceNotice(
  dialects: readonly Dialect[]
): string | undefined {
  const context = useContext(PreviewContext);
  if (!context?.enabled || context.voicesLoading) return undefined;
  if (context.voicesError) return context.voicesError;
  const preference = context.dialectPreference;
  const missing = dialects.filter(
    (dialect) => !voiceForDialect(context.voices, dialect, preference)
  );
  if (missing.length === 0) return undefined;
  const labels = missing
    .map(
      (dialect) =>
        `${DIALECT_SHORT_LABEL[dialect]}（${localeForDialect(dialect, preference) ?? "英语"}）`
    )
    .join("、");
  return `${labels}暂无可用发音人，对应的「获取语音」已禁用`;
}

export function resolvePronunciationPreviewVoice(
  voices: VoiceOption[],
  dialect: Dialect,
  preference: AdminDialectPreference,
  profile?: VoiceProfileV3
) {
  const locale = localeForDialect(dialect, preference);
  const settings = profile?.voices.filter((setting) => setting.enabled) ?? [];
  const voice = settings.length
    ? settings
        .map((setting) => voices.find((row) => row.id === setting.voice_id))
        .find(
          (row) =>
            row &&
            speechAccentGroup(row.locale, row.accent) ===
              speechAccentGroup(locale)
        )
    : profile?.dubbing
      ? undefined
      : voiceForDialect(voices, dialect, preference);
  return {
    voice,
    rate:
      (voice
        ? voiceSettingFor(profile?.voices ?? [], voice.id)?.rate_percent
        : undefined) ?? 0,
    isDefault: settings.length === 0
  };
}

function useResolvedPreviewProfile(
  context: PreviewContextValue,
  profile: VoiceProfileV3 | undefined,
  content: RichTextV2,
  dialect: Dialect,
  adapter = context.adapter
) {
  const locale = localeForDialect(dialect, context.dialectPreference);
  const key = JSON.stringify([
    profile,
    content,
    locale,
    adapter.audioSourceKey
  ]);
  const inputRef = useRef({ profile, content, locale, adapter });
  inputRef.current = { profile, content, locale, adapter };
  const [resolved, setResolved] = useState<{
    key: string;
    voices: VoiceSetting[];
    error?: string;
  }>();
  useEffect(() => {
    const { profile, content, locale, adapter } = inputRef.current;
    if (
      !context.enabled ||
      !profile?.dubbing ||
      !adapter.resolveVoices ||
      !content.text.trim()
    )
      return;
    const controller = new AbortController();
    void adapter
      .resolveVoices(
        { profile, content, accent: locale === "en-GB" ? "gb" : "us" },
        { signal: controller.signal }
      )
      .then((voices) => {
        if (!controller.signal.aborted) setResolved({ key, voices });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResolved({ key, voices: [], error: errorMessage(error) });
      });
    return () => controller.abort();
  }, [key, context.enabled]);
  if (!profile?.dubbing) return { profile, pending: false, error: undefined };
  if (!adapter.resolveVoices)
    return {
      profile: { ...profile, voices: [] },
      pending: false,
      error: "当前环境尚未支持推荐配音解析"
    };
  return {
    profile: {
      ...profile,
      voices: retainResolvedAudio(
        resolved?.key === key ? resolved.voices : [],
        profile.voices
      )
    },
    pending: !!content.text.trim() && resolved?.key !== key,
    error: resolved?.key === key ? resolved.error : undefined
  };
}

export function PronunciationPreviewVoiceSummary({
  dialect,
  voiceProfile,
  pronunciationId,
  content,
  column = "voice"
}: {
  dialect: Dialect;
  voiceProfile?: VoiceProfileV3;
  pronunciationId?: string;
  content?: RichTextV2;
  column?: "voice" | "rate";
}) {
  const context = useContext(PreviewContext);
  if (!context) throw new Error("PronunciationPreviewProvider is required");
  const resolved = useResolvedPreviewProfile(
    context,
    voiceProfile,
    content ?? { version: 2, text: "", annotations: [] },
    dialect
  );
  const { voice, rate, isDefault } = resolvePronunciationPreviewVoice(
    context.voices,
    dialect,
    context.dialectPreference,
    resolved.profile
  );
  const enabled = resolved.profile?.voices.filter((row) => row.enabled) ?? [];
  if (column === "rate")
    return <span>{voice ? `${(1 + rate / 100).toFixed(2)}×` : "—"}</span>;
  const summary = (
    <span
      className="word-pronunciation-voice-label"
      title={voice ? `${isDefault ? "默认 · " : ""}${voice.label}` : undefined}
    >
      {context.voicesLoading || resolved.pending
        ? "正在读取音色"
        : voice
          ? voice.label.replace(` · ${voice.locale}`, "")
          : resolved.error || context.voicesError || "当前口音没有可用音色"}
    </span>
  );
  if (enabled.length <= 1) return summary;
  return (
    <Popover
      trigger="click"
      classNames={{ root: "word-pronunciation-voice-popover" }}
      title={
        <div className="word-pronunciation-voice-heading">
          <span>已启用音色</span>
          <span className="word-pronunciation-voice-count">
            {enabled.length}
          </span>
        </div>
      }
      destroyOnHidden
      content={
        <ul className="word-pronunciation-voice-list" aria-label="已启用音色">
          {enabled.map((setting) => {
            const option = context.voices.find(
              (row) => row.id === setting.voice_id
            );
            const name = option
              ? option.label.replace(` · ${option.locale}`, "")
              : setting.voice_id;
            return (
              <li
                className="word-pronunciation-voice-row"
                key={setting.version_id ?? setting.voice_id}
              >
                <div className="word-pronunciation-voice-info">
                  <span className="word-pronunciation-voice-name" title={name}>
                    {name}
                  </span>
                  <span className="word-pronunciation-voice-locale">
                    {option?.locale ?? "不可用"}
                  </span>
                </div>
                <span className="word-pronunciation-voice-rate">
                  {(1 + setting.rate_percent / 100).toFixed(2)}×
                </span>
                {pronunciationId && (
                  <div className="word-pronunciation-voice-controls">
                    <PronunciationPreviewControls
                      pronunciationId={pronunciationId}
                      dialect={dialect}
                      content={content}
                      voiceProfile={{ voices: [setting] }}
                      disabled={!content}
                      disabledReason="请先填写当前口音的合成输入"
                      ariaLabelPrefix={option?.label ?? setting.voice_id}
                      compact
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      }
    >
      <Button
        type="text"
        size="small"
        className="word-pronunciation-voice-summary"
        aria-label={`查看${dialect === "uk" ? "英式" : dialect === "us" ? "美式" : "通用"}全部 ${enabled.length} 个音色`}
      >
        {summary}
        <DownOutlined />
      </Button>
    </Popover>
  );
}

export function PronunciationPreviewControls({
  pronunciationId,
  previewAdapter,
  spelling,
  content,
  voiceProfile,
  playbackOnly = false,
  dialect,
  ariaLabelPrefix,
  disabled = false,
  disabledReason,
  compact = false,
  audioFactory = (src) => new Audio(src),
  children
}: {
  pronunciationId: string;
  previewAdapter?: VoicePreviewAdapter;
  spelling?: string;
  content?: RichTextV2;
  voiceProfile?: VoiceProfileV3;
  playbackOnly?: boolean;
  dialect: Dialect;
  ariaLabelPrefix?: string;
  disabled?: boolean;
  disabledReason?: string;
  compact?: boolean;
  audioFactory?: (src: string) => HTMLAudioElement;
  children?: ReactNode;
}) {
  const context = useContext(PreviewContext);
  if (!context) throw new Error("PronunciationPreviewProvider is required");
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VoicePreviewResult>();
  const [status, setStatus] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef<symbol | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resultRef = useRef<VoicePreviewResult | null>(null);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetLocale = localeForDialect(dialect, context.dialectPreference);
  const previewContent = useMemo<RichTextV2>(
    () => content ?? { version: 2, text: spelling ?? "", annotations: [] },
    [content, spelling]
  );
  const resolved = useResolvedPreviewProfile(
    context,
    voiceProfile,
    previewContent,
    dialect,
    previewAdapter ?? context.adapter
  );
  const enabledSettings =
    resolved.profile?.voices.filter((setting) => setting.enabled) ?? [];
  const { voice } = resolvePronunciationPreviewVoice(
    context.voices,
    dialect,
    context.dialectPreference,
    resolved.profile
  );
  const selectedSetting = voice
    ? voiceSettingFor(resolved.profile?.voices ?? [], voice.id)
    : undefined;
  const contentKey = JSON.stringify([
    previewContent,
    targetLocale,
    voice?.id,
    selectedSetting?.rate_percent ?? 0,
    selectedSetting?.pitch_semitones ?? 0,
    selectedSetting?.volume_percent ?? 100,
    selectedSetting?.style ?? "",
    selectedSetting?.style_degree,
    selectedSetting?.role,
    selectedSetting?.output_format,
    selectedSetting?.audio_asset_id,
    voiceProfile?.dubbing,
    resolved.pending
  ]);
  const text = previewContent.text.trim();
  const playLabel = ariaLabelPrefix
    ? `${ariaLabelPrefix} 播放语音`
    : "播放语音";
  const generateLabel = ariaLabelPrefix
    ? `${ariaLabelPrefix} 获取语音`
    : "获取语音";

  const clearExpiry = useCallback(() => {
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    expiryTimerRef.current = null;
  }, []);

  const discardResult = useCallback(() => {
    clearExpiry();
    audioRef.current?.pause();
    audioRef.current = null;
    resultRef.current?.dispose?.();
    resultRef.current = null;
    setResult(undefined);
  }, [clearExpiry]);

  const cleanup = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    discardResult();
  }, [discardResult]);

  const stopPlayback = useCallback(() => {
    generationRef.current = null;
    cleanup();
    setBusy(false);
    setStatus("");
  }, [cleanup]);
  const { claimPlayback, releasePlayback } = context;

  useLayoutEffect(() => {
    generationRef.current = null;
    cleanup();
    setBusy(false);
    setStatus("");
  }, [
    cleanup,
    contentKey,
    pronunciationId,
    voice?.id,
    disabled,
    previewAdapter
  ]);

  useEffect(
    () => () => {
      generationRef.current = null;
      cleanup();
      releasePlayback(stopPlayback);
    },
    [cleanup, releasePlayback, stopPlayback]
  );

  const attachAudio = useCallback(
    (preview: VoicePreviewResult): HTMLAudioElement => {
      audioRef.current?.pause();
      const audio = audioFactory(preview.audioUrl);
      audioRef.current = audio;
      audio.addEventListener(
        "error",
        () => {
          if (audioRef.current !== audio) return;
          discardResult();
          setStatus("试听音频加载失败，请重新生成");
          void message.error("试听音频加载失败，请重新生成");
        },
        { once: true }
      );
      audio.addEventListener(
        "ended",
        () => {
          if (audioRef.current === audio) setStatus("已生成试听");
        },
        { once: true }
      );
      return audio;
    },
    [audioFactory, discardResult, message]
  );

  const generate = async () => {
    if (
      disabled ||
      !context.enabled ||
      context.voicesLoading ||
      resolved.pending ||
      !voice ||
      !text ||
      busy ||
      generationRef.current ||
      abortRef.current
    ) {
      return;
    }
    if (
      previewContent.annotations.some((mark) => mark.type === "phoneme") &&
      voice.locale !== targetLocale
    ) {
      setStatus(
        "指定音素仅支持完全匹配的地区，请选择对应音色或显式改用自然朗读"
      );
      return;
    }
    claimPlayback(stopPlayback);
    const generation = Symbol("pronunciation-preview-generation");
    generationRef.current = generation;
    cleanup();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setStatus("正在生成试听…");
    try {
      const adapter = previewAdapter ?? context.adapter;
      const preview =
        selectedSetting?.audio_asset_id && adapter.resolveAudio
          ? await adapter.resolveAudio(selectedSetting.audio_asset_id, {
              signal: controller.signal
            })
          : await adapter.synthesize(
              {
                language: "en",
                content: previewContent,
                voiceId: voice.id,
                ratePercent: selectedSetting?.rate_percent ?? 0,
                ...(selectedSetting?.output_format
                  ? { outputFormat: selectedSetting.output_format }
                  : {}),
                ...(selectedSetting?.pitch_semitones !== undefined
                  ? { pitchSemitones: selectedSetting.pitch_semitones }
                  : {}),
                ...(selectedSetting?.volume_percent !== undefined
                  ? { volumePercent: selectedSetting.volume_percent }
                  : {}),
                ...(selectedSetting?.style
                  ? { style: selectedSetting.style }
                  : {}),
                ...(selectedSetting?.style_degree !== undefined
                  ? { styleDegree: selectedSetting.style_degree }
                  : {}),
                ...(selectedSetting?.role !== undefined
                  ? { role: selectedSetting.role }
                  : {})
              },
              { signal: controller.signal }
            );
      if (controller.signal.aborted) {
        preview.dispose?.();
        return;
      }
      resultRef.current = preview;
      setResult(preview);
      const expiresIn = Date.parse(preview.expiresAt) - Date.now();
      const expire = () => {
        discardResult();
        setStatus("试听已过期，请重新生成");
      };
      if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
        expire();
        return;
      }
      expiryTimerRef.current = setTimeout(expire, expiresIn);

      const audio = attachAudio(preview);
      try {
        await audio.play();
        if (audioRef.current === audio) {
          setStatus(preview.cached ? "播放中（缓存命中）" : "播放中（新合成）");
        }
      } catch {
        if (audioRef.current === audio) {
          setStatus("浏览器阻止自动播放，请点击播放语音");
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const nextStatus = errorMessage(error);
        setStatus(nextStatus);
        void message.error(nextStatus);
      }
    } finally {
      if (generationRef.current === generation) {
        generationRef.current = null;
      }
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  };

  const replay = async () => {
    if (disabled || !context.enabled || !result) return;
    claimPlayback(stopPlayback);
    const audio = attachAudio(result);
    try {
      await audio.play();
      if (audioRef.current === audio) setStatus("播放中");
    } catch {
      if (audioRef.current === audio) {
        setStatus("播放失败，请检查浏览器音频权限后重试");
        void message.error("播放失败，请检查浏览器音频权限后重试");
      }
    }
  };

  const unavailableReason = !context.enabled
    ? "语音试听功能未启用"
    : context.voicesLoading || resolved.pending
      ? "正在加载发音人…"
      : resolved.error
        ? resolved.error
        : context.voicesError
          ? context.voicesError
          : !text
            ? content
              ? "请先填写字典音标"
              : "请先填写词形拼写"
            : !voice
              ? enabledSettings.length
                ? `已选音色不匹配 ${targetLocale ?? "当前口音"}，请在发音设置中选择对应音色`
                : `${targetLocale ?? "英语"} 暂无可用发音人`
              : "获取语音";

  const controls = (
    <>
      {
        <Tooltip
          title={
            (disabled ? disabledReason : undefined) ||
            status ||
            (result
              ? "播放语音"
              : playbackOnly
                ? unavailableReason
                : "请先获取语音")
          }
        >
          <Button
            className="word-pronunciation-play-action"
            data-playback-dialect={targetLocale === "en-GB" ? "uk" : "us"}
            icon={<SoundOutlined />}
            disabled={
              disabled ||
              !context.enabled ||
              busy ||
              (!result &&
                (!playbackOnly || context.voicesLoading || !voice || !text))
            }
            aria-label={playLabel}
            loading={playbackOnly && busy}
            onClick={() => void (result ? replay() : generate())}
          />
        </Tooltip>
      }
      {children}
      {voicePreviewIsMock && (
        <Tooltip title="当前走本地 TTS mock，试听音频不是真实合成结果">
          <Tag
            className="word-pronunciation-mock-tag"
            color="warning"
            role="note"
            aria-label="试听走本地 TTS mock，音频不是真实合成结果"
          >
            模拟
          </Tag>
        </Tooltip>
      )}
      {!playbackOnly && (
        <Tooltip title={status || unavailableReason}>
          <Button
            className="word-pronunciation-voice-action word-pronunciation-sync-action"
            aria-label={generateLabel}
            icon={<SyncOutlined spin={busy} />}
            loading={busy}
            disabled={
              disabled ||
              !context.enabled ||
              context.voicesLoading ||
              !voice ||
              !text ||
              busy
            }
            onClick={() => void generate()}
          />
        </Tooltip>
      )}
    </>
  );
  return compact ? <Space.Compact block>{controls}</Space.Compact> : controls;
}

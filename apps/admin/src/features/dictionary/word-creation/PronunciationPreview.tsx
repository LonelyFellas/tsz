import { SoundOutlined, SyncOutlined } from "@ant-design/icons";
import { App, Button, Space, Tooltip } from "antd";
import type { Dialect, RichTextV2 } from "@tsz/types";
import type {
  VoiceOption,
  VoicePreviewAdapter,
  VoicePreviewResult
} from "@tsz/voice-editor/types";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { env } from "@/lib/env";
import { adminVoicePreviewAdapter } from "../voice-editor/dataSource";

interface PreviewContextValue {
  enabled: boolean;
  voices: VoiceOption[];
  voicesLoading: boolean;
  voicesError: string;
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
  const enabled = env.VOICE_PREVIEW && !readOnly;
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
      enabled,
      voices,
      voicesLoading,
      voicesError,
      adapter: adminVoicePreviewAdapter
    }),
    [enabled, voices, voicesError, voicesLoading]
  );
  return (
    <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>
  );
}

function localeForDialect(dialect: Dialect): string | undefined {
  if (dialect === "uk") return "en-GB";
  if (dialect === "us") return "en-US";
  return undefined;
}

function voiceForDialect(
  voices: VoiceOption[],
  dialect: Dialect
): VoiceOption | undefined {
  const locale = localeForDialect(dialect)?.toLowerCase();
  if (locale) {
    return voices.find((voice) => voice.locale.toLowerCase() === locale);
  }
  return voices.find((voice) => voice.isDefault) ?? voices[0];
}

export function PronunciationPreviewControls({
  pronunciationId,
  spelling,
  content,
  dialect,
  ariaLabelPrefix,
  disabled = false,
  compact = false,
  children
}: {
  pronunciationId: string;
  spelling?: string;
  content?: RichTextV2;
  dialect: Dialect;
  ariaLabelPrefix?: string;
  disabled?: boolean;
  compact?: boolean;
  children?: ReactNode;
}) {
  const context = useContext(PreviewContext);
  if (!context) throw new Error("PronunciationPreviewProvider is required");
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VoicePreviewResult>();
  const [status, setStatus] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resultRef = useRef<VoicePreviewResult | null>(null);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voice = voiceForDialect(context.voices, dialect);
  const previewContent = useMemo<RichTextV2>(
    () => content ?? { version: 2, text: spelling ?? "", annotations: [] },
    [content, spelling]
  );
  const contentKey = JSON.stringify(previewContent);
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

  useEffect(() => {
    cleanup();
    setBusy(false);
    setStatus("");
  }, [cleanup, contentKey, pronunciationId, voice?.id]);

  useEffect(() => cleanup, [cleanup]);

  const attachAudio = useCallback(
    (preview: VoicePreviewResult): HTMLAudioElement => {
      audioRef.current?.pause();
      const audio = new Audio(preview.audioUrl);
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
    [discardResult, message]
  );

  const generate = async () => {
    if (
      disabled ||
      !context.enabled ||
      context.voicesLoading ||
      !voice ||
      !text ||
      busy ||
      abortRef.current
    ) {
      return;
    }
    cleanup();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setStatus("正在生成试听…");
    try {
      const preview = await context.adapter.synthesize(
        {
          language: "en",
          content: previewContent,
          voiceId: voice.id
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
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  };

  const replay = async () => {
    if (disabled || !context.enabled || !result) return;
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
    : context.voicesLoading
      ? "正在加载发音人…"
      : context.voicesError
        ? context.voicesError
        : !text
          ? "请先填写词形拼写"
          : !voice
            ? `${localeForDialect(dialect) ?? "英语"} 暂无可用发音人`
            : "获取语音";

  const controls = (
    <>
      <Tooltip title={status || (result ? "播放语音" : "请先获取语音")}>
        <Button
          className="word-pronunciation-play-action"
          icon={<SoundOutlined />}
          disabled={disabled || !context.enabled || !result}
          aria-label={playLabel}
          onClick={() => void replay()}
        />
      </Tooltip>
      {children}
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
    </>
  );
  return compact ? <Space.Compact block>{controls}</Space.Compact> : controls;
}

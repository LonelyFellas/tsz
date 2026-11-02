import type { AdminSpeechVoice, AdminVoiceParameters } from "@tsz/types";
import { Button, Typography } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SsmlDraft } from "@tsz/voice-editor/types";
import { api, usePermission } from "@/lib/auth";
import { recommendationError, type DubbingSide } from "./dubbing-model";
import { VoiceAuditionPanel } from "./VoiceAuditionPanel";
import { type VoicePreviewData } from "./VoicePreviewResult";
import {
  newVoiceTrial,
  voiceTrialIssue,
  voiceTrialSetting,
  effectiveVoiceParameters,
  type VoiceTrialSource
} from "./voice-trial";
import { useReadingPreviewAdapter } from "@/features/dictionary/word-creation-v3/components/useReadingPreviewAdapter";
import { adminVoicePreviewAdapter } from "@/features/dictionary/voice-editor/dataSource";

export const DEFAULT_DUBBING_TRIAL_TEXT =
  "Please record the interview before the meeting starts.";

export function DubbingAudition({
  voice,
  parameters,
  originalVoice,
  originalParameters,
  side,
  onBeforeAudition,
  source: providedSource,
  onSourceChange,
  disabled = false,
  ssmlDraft,
  onSsmlDraftChange
}: {
  voice?: AdminSpeechVoice;
  parameters?: AdminVoiceParameters;
  originalVoice?: AdminSpeechVoice;
  originalParameters?: AdminVoiceParameters;
  side: DubbingSide;
  onBeforeAudition?: () => void;
  source?: VoiceTrialSource;
  onSourceChange?: (source: VoiceTrialSource) => void;
  disabled?: boolean;
  ssmlDraft?: SsmlDraft;
  onSsmlDraftChange?: (draft: SsmlDraft) => void;
}) {
  const canGenerate = usePermission("speech.generate");
  const canRead = usePermission("words.access");
  const [localSource, setLocalSource] = useState(() =>
    newVoiceTrial(DEFAULT_DUBBING_TRIAL_TEXT)
  );
  const source = providedSource ?? localSource;
  const [ready, setReady] = useState(true);
  const [preview, setPreview] = useState<VoicePreviewData>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const request = useRef<AbortController | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const tools = useRef<() => void>(undefined);
  const registerTools = useCallback((value: () => void) => {
    tools.current = value;
    return () => {
      if (tools.current === value) tools.current = undefined;
    };
  }, []);
  const createReadingAdapter = useReadingPreviewAdapter(undefined, undefined, {
    preserveDirectPhonemes: true
  });
  const adapter = useMemo(
    () =>
      source.reading_links.length
        ? createReadingAdapter(source.reading_links)
        : adminVoicePreviewAdapter,
    [createReadingAdapter, source.reading_links]
  );
  const stop = useCallback(() => {
    request.current?.abort();
    request.current = null;
    audio.current?.pause();
    tools.current?.();
  }, []);
  const signature = JSON.stringify([
    source,
    voice?.alias,
    parameters,
    side,
    disabled,
    canGenerate,
    canRead
  ]);
  useEffect(() => {
    stop();
    setPreview(undefined);
    setError(undefined);
    setPending(false);
    return stop;
  }, [signature, stop]);
  async function audition(original: boolean) {
    const target = original ? originalVoice : voice;
    const raw = original ? originalParameters : parameters;
    if (!target || !raw || !canGenerate || !canRead || disabled || !ready)
      return;
    const sourceIssue = voiceTrialIssue(target, source);
    if (sourceIssue) {
      stop();
      setPreview(undefined);
      setPending(false);
      setError(sourceIssue);
      return;
    }
    const caps = target.capabilities;
    const effective = effectiveVoiceParameters(target, raw);
    const style = effective.style;
    const issue = recommendationError(
      "试听",
      side,
      {
        id: "preview",
        name: "当前设置",
        voice_alias: target.alias,
        parameters: effective
      },
      target
    );
    if (issue) {
      setError(issue);
      return;
    }
    stop();
    onBeforeAudition?.();
    const controller = new AbortController();
    request.current = controller;
    setPreview(undefined);
    setError(undefined);
    setPending(true);
    try {
      const result = source.reading_links.length
        ? await (async () => {
            const ssml = await adapter.renderSsml!(
              {
                content: source.content,
                setting: voiceTrialSetting(
                  target,
                  effective,
                  source.output_format
                )
              },
              { signal: controller.signal }
            );
            controller.signal.throwIfAborted();
            return api.speech.manualPreview(
              {
                voice_alias: target.alias,
                ssml,
                output_format: source.output_format
              },
              controller.signal
            );
          })()
        : await api.speech.preview(
            {
              content: source.content,
              ...(source.output_format === "wav"
                ? { output_format: "wav" as const }
                : {}),
              voice_alias: target.alias,
              ...(caps.min_rate_percent !== caps.max_rate_percent
                ? { rate_percent: effective.rate_percent }
                : {}),
              ...(caps.min_pitch_semitones !== caps.max_pitch_semitones
                ? { pitch_semitones: effective.pitch_semitones }
                : {}),
              ...(caps.supports_volume_percent !== false &&
              effective.volume_percent != null
                ? { volume_percent: effective.volume_percent }
                : {}),
              ...(style ? { style } : {}),
              ...(effective.style_degree != null
                ? { style_degree: effective.style_degree }
                : {}),
              ...(effective.role ? { role: effective.role } : {})
            },
            controller.signal
          );
      if (request.current === controller && !controller.signal.aborted)
        setPreview({
          result,
          voice: target,
          parameters: effective,
          comparison: original ? "原参数" : "当前参数"
        });
    } catch {
      if (request.current === controller && !controller.signal.aborted)
        setError("试听失败，请检查音色或稍后重试；当前参数已保留。");
    } finally {
      if (request.current === controller) setPending(false);
    }
  }
  const allowed =
    canGenerate &&
    canRead &&
    ready &&
    !disabled &&
    !!voice &&
    !voiceTrialIssue(voice, source);
  if (!voice || !parameters) return null;
  return (
    <>
      <VoiceAuditionPanel
        key={voice.alias}
        voice={voice}
        source={source}
        canReadWords={canRead}
        readOnly={disabled}
        onSourceChange={(next) => {
          stop();
          if (onSourceChange) onSourceChange(next);
          else setLocalSource(next);
        }}
        onValidationChange={setReady}
        canGenerate={canGenerate && canRead}
        canAudition={allowed}
        pending={pending}
        onAudition={() => void audition(false)}
        onCancelPreview={() => {
          stop();
          setPending(false);
        }}
        preview={preview}
        error={error}
        player={audio}
        adapter={adapter}
        setting={voiceTrialSetting(
          voice,
          effectiveVoiceParameters(voice, parameters),
          source.output_format
        )}
        registerStop={registerTools}
        ssmlDraft={ssmlDraft}
        onSsmlDraftChange={onSsmlDraftChange}
        comparisonAction={
          originalVoice &&
          originalParameters && (
            <Button disabled={!allowed} onClick={() => void audition(true)}>
              试听原参数
            </Button>
          )
        }
      />
      {!canGenerate && (
        <Typography.Paragraph type="secondary">
          需要语音生成权限才能试听。
        </Typography.Paragraph>
      )}
    </>
  );
}

import {
  useVoiceEditorTranslation,
  useVoiceEditorMessageState,
  createVoiceEditorMessage
} from "../i18n";
import { Button, Space, Typography } from "@tsz/ui/admin/display";
import { Checkbox, InputNumber, Select } from "@tsz/ui/admin/forms";
import { useEffect, useRef, useState } from "react";
import type { VoicePreviewResult } from "../../types";

export function waveformPeaks(
  channels: readonly Float32Array[],
  bins = 240
): number[] {
  const length = channels[0]?.length ?? 0;
  if (!length) return [];
  return Array.from({ length: Math.min(bins, length) }, (_, bin) => {
    const start = Math.floor((bin * length) / Math.min(bins, length));
    const end = Math.floor(((bin + 1) * length) / Math.min(bins, length));
    let peak = 0;
    for (const channel of channels)
      for (let sample = start; sample < end; sample++)
        peak = Math.max(peak, Math.abs(channel[sample] ?? 0));
    return peak;
  });
}

export function loopPosition(
  position: number,
  start: number,
  end: number
): number {
  return end > start && (position >= end || position < start)
    ? start
    : position;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ReviewAudio {
  audio: HTMLAudioElement;
  result: VoicePreviewResult;
  name: string;
}

export function AudioReview({
  media,
  onPlay
}: {
  media: ReviewAudio;
  onPlay?: () => void;
}) {
  const { t } = useVoiceEditorTranslation();
  const { audio, result } = media;
  const [blob, setBlob] = useState<Blob>();
  const [peaks, setPeaks] = useState<number[]>([]);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(!audio.paused);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [loop, setLoop] = useState(false);
  const [hover, setHover] = useState<number>();
  const [error, setError] = useVoiceEditorMessageState("");
  const [loading, setLoading] = useState(true);
  const drag = useRef<number | undefined>(undefined);
  const onPlayRef = useRef(onPlay);
  onPlayRef.current = onPlay;
  const playback = useRef({ range, loop, duration });
  playback.current = { range, loop, duration };

  useEffect(() => {
    const controller = new AbortController();
    let decoder: AudioContext | undefined;
    setLoading(true);
    setBlob(undefined);
    setPeaks([]);
    setError("");
    setLoop(false);
    setRange([0, 0]);
    async function load() {
      const value = result.loadAudio
        ? await result.loadAudio({ signal: controller.signal })
        : await fetch(result.audioUrl, { signal: controller.signal }).then(
            (response) => {
              if (!response.ok) throw new Error(t("could_not_read_audio"));
              return response.blob();
            }
          );
      if (controller.signal.aborted) return;
      setBlob(value);
      if (typeof AudioContext === "undefined") return;
      decoder = new AudioContext();
      const decoded = await decoder.decodeAudioData(await value.arrayBuffer());
      if (controller.signal.aborted) return;
      setDuration(decoded.duration);
      setRange([0, decoded.duration]);
      setPeaks(
        waveformPeaks(
          Array.from({ length: decoded.numberOfChannels }, (_, index) =>
            decoded.getChannelData(index)
          )
        )
      );
    }
    void load()
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            createVoiceEditorMessage(
              "could_not_read_or_decode_the_waveform_audition_again_and_retry"
            )
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
        void decoder?.close().catch(() => {});
      });
    return () => {
      controller.abort();
      void decoder?.close().catch(() => {});
    };
  }, [result, setError]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      const { range, loop } = playback.current;
      if (loop && !audio.paused) {
        const next = loopPosition(audio.currentTime, range[0], range[1]);
        if (next !== audio.currentTime) audio.currentTime = next;
      }
      setPosition(audio.currentTime || 0);
      setPlaying(!audio.paused);
    };
    const tick = () => {
      update();
      if (!audio.paused) frame = requestAnimationFrame(tick);
    };
    const play = () => {
      onPlayRef.current?.();
      cancelAnimationFrame(frame);
      tick();
    };
    const ended = () => {
      if (
        playback.current.loop &&
        playback.current.range[1] > playback.current.range[0]
      ) {
        audio.currentTime = playback.current.range[0];
        void audio
          .play()
          .catch(() =>
            setError(
              createVoiceEditorMessage("audio_playback_failed_audition_again")
            )
          );
      } else update();
    };
    audio.addEventListener("timeupdate", update);
    audio.addEventListener("play", play);
    audio.addEventListener("pause", update);
    audio.addEventListener("ended", ended);
    if (!audio.paused) play();
    return () => {
      cancelAnimationFrame(frame);
      audio.removeEventListener("timeupdate", update);
      audio.removeEventListener("play", play);
      audio.removeEventListener("pause", update);
      audio.removeEventListener("ended", ended);
      audio.playbackRate = 1;
    };
  }, [audio, setError]);

  function seek(time: number) {
    audio.currentTime = Math.max(0, Math.min(duration, time));
    setPosition(audio.currentTime);
  }
  function point(event: React.PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(
        duration,
        ((event.clientX - bounds.left) / bounds.width) * duration
      )
    );
  }
  const at = hover ?? position;
  const peak =
    peaks[
      Math.min(peaks.length - 1, Math.floor((at / duration) * peaks.length))
    ] ?? 0;
  return (
    <section
      className="tsz-ve-audio-review"
      aria-label={t("review", { p0: media.name })}
    >
      <Typography.Text strong>{media.name}</Typography.Text>
      {loading && (
        <Typography.Text type="secondary">
          {t("loading_audio_waveform")}
        </Typography.Text>
      )}
      {error && <Typography.Text type="danger">{error}</Typography.Text>}
      {peaks.length > 0 && (
        <>
          <svg
            viewBox="0 0 720 100"
            preserveAspectRatio="none"
            className="tsz-ve-waveform"
            role="slider"
            tabIndex={0}
            aria-label={t(
              "audio_waveform_click_to_seek_or_drag_to_select_a_range"
            )}
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={position}
            onKeyDown={(event) => {
              if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
                event.preventDefault();
                seek(position + (event.key === "ArrowLeft" ? -0.1 : 0.1));
              }
            }}
            onPointerDown={(event) => {
              drag.current = point(event);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const time = point(event);
              setHover(time);
              if (drag.current !== undefined)
                setRange([
                  Math.min(drag.current, time),
                  Math.max(drag.current, time)
                ]);
            }}
            onPointerUp={(event) => {
              const time = point(event);
              if (
                drag.current !== undefined &&
                Math.abs(time - drag.current) < 0.02
              )
                seek(time);
              drag.current = undefined;
            }}
            onPointerCancel={() => {
              drag.current = undefined;
            }}
            onPointerLeave={() => setHover(undefined)}
          >
            <line
              x1="0"
              x2="720"
              y1="50"
              y2="50"
              className="tsz-ve-wave-baseline"
            />
            {range[1] > range[0] && (
              <rect
                x={(range[0] / duration) * 720}
                y="0"
                width={((range[1] - range[0]) / duration) * 720}
                height="100"
                className="tsz-ve-wave-selection"
              />
            )}
            <path
              d={peaks
                .map(
                  (value, index) =>
                    `M${((index + 0.5) / peaks.length) * 720},${50 - value * 46}v${value * 92}`
                )
                .join(" ")}
              className="tsz-ve-wave-samples"
            />
            <line
              x1={(at / duration) * 720}
              x2={(at / duration) * 720}
              y1="0"
              y2="100"
              className="tsz-ve-wave-cursor"
            />
          </svg>
          <div className="tsz-ve-wave-scale">
            <span>{t("0_seconds")}</span>
            <span>
              {at.toFixed(2)} {t("seconds_peak")} {peak.toFixed(3)}
            </span>
            <span>
              {duration.toFixed(2)} {t("seconds")}
            </span>
          </div>
        </>
      )}
      <Space wrap>
        <Button
          size="small"
          onClick={() => {
            if (audio.paused) {
              if (loop)
                seek(loopPosition(audio.currentTime, range[0], range[1]));
              void audio
                .play()
                .catch(() =>
                  setError(
                    createVoiceEditorMessage(
                      "audio_playback_failed_audition_again"
                    )
                  )
                );
            } else audio.pause();
          }}
        >
          {playing ? t("pause_2") : t("play")}
        </Button>
        <Select
          aria-label={t("review_playback_speed")}
          size="small"
          defaultValue={1}
          options={[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => ({
            value,
            label: `${value}×`
          }))}
          onChange={(value) => {
            audio.playbackRate = value;
          }}
        />
        <InputNumber
          aria-label={t("loop_start_in_seconds")}
          size="small"
          min={0}
          max={range[1]}
          precision={2}
          step={0.1}
          value={range[0]}
          disabled={!duration}
          onChange={(value) => {
            if (value !== null) setRange([Math.min(value, range[1]), range[1]]);
          }}
        />
        <span>–</span>
        <InputNumber
          aria-label={t("loop_end_in_seconds")}
          size="small"
          min={range[0]}
          max={duration}
          precision={2}
          step={0.1}
          value={range[1]}
          disabled={!duration}
          onChange={(value) => {
            if (value !== null) setRange([range[0], Math.max(range[0], value)]);
          }}
        />
        <Checkbox
          checked={loop}
          disabled={range[1] <= range[0]}
          onChange={(event) => {
            setLoop(event.target.checked);
            if (event.target.checked) seek(range[0]);
          }}
        >
          {t("loop_selection")}
        </Checkbox>
        <Button
          size="small"
          disabled={!blob}
          onClick={() => {
            if (blob)
              downloadBlob(
                blob,
                result.originalName ??
                  `${media.name}.${blob.type.includes("wav") ? "wav" : "mp3"}`
              );
          }}
        >
          {t("download_original_audio")}
        </Button>
      </Space>
      <Typography.Text type="secondary">
        {t("playback_speed_only_affects_this_review")}
      </Typography.Text>
    </section>
  );
}

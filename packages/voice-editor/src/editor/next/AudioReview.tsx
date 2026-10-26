import { Button, Checkbox, InputNumber, Select, Space, Typography } from "antd";
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
  const { audio, result } = media;
  const [blob, setBlob] = useState<Blob>();
  const [peaks, setPeaks] = useState<number[]>([]);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(!audio.paused);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [loop, setLoop] = useState(false);
  const [hover, setHover] = useState<number>();
  const [error, setError] = useState("");
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
              if (!response.ok) throw new Error("音频读取失败");
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
          setError("波形读取或解码失败，可重新试听后重试。");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
        void decoder?.close().catch(() => {});
      });
    return () => {
      controller.abort();
      void decoder?.close().catch(() => {});
    };
  }, [result]);

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
        void audio.play().catch(() => setError("音频播放失败，请重新试听"));
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
  }, [audio]);

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
    <section className="tsz-ve-audio-review" aria-label={`审听 ${media.name}`}>
      <Typography.Text strong>{media.name}</Typography.Text>
      {loading && (
        <Typography.Text type="secondary">
          正在读取真实音频波形…
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
            aria-label="音频波形，点击定位或拖动选择区间"
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
            <span>0 秒</span>
            <span>
              {at.toFixed(2)} 秒 · 峰值 {peak.toFixed(3)}
            </span>
            <span>{duration.toFixed(2)} 秒</span>
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
                .catch(() => setError("音频播放失败，请重新试听"));
            } else audio.pause();
          }}
        >
          {playing ? "暂停" : "播放"}
        </Button>
        <Select
          aria-label="审听倍速"
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
          aria-label="循环起点秒数"
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
          aria-label="循环终点秒数"
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
          区间循环
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
          下载原音频
        </Button>
      </Space>
      <Typography.Text type="secondary">倍速仅影响本次审听。</Typography.Text>
    </section>
  );
}

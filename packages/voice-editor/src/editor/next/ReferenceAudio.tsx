import { Button, Space, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioReview, type ReviewAudio } from "./AudioReview";
import { AUDIO_UPLOAD_ACCEPT, preflightAudioFile } from "./audioAssets";

export function ReferenceAudio({
  onPlay,
  registerStop
}: {
  onPlay: () => void;
  registerStop?: (stop: () => void) => () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const active = useRef<ReviewAudio | undefined>(undefined);
  const [media, setMedia] = useState<ReviewAudio>();
  const [error, setError] = useState("");
  const stop = useCallback(() => active.current?.audio.pause(), []);
  const clear = useCallback(() => {
    active.current?.audio.pause();
    active.current?.result.dispose?.();
    active.current = undefined;
    setMedia(undefined);
  }, []);
  useEffect(() => registerStop?.(stop), [registerStop, stop]);
  useEffect(() => clear, [clear]);
  return (
    <section className="tsz-ve-reference-audio" aria-label="本次参考音频">
      <input
        ref={input}
        aria-label="导入参考音频"
        type="file"
        accept={AUDIO_UPLOAD_ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const issue = preflightAudioFile(file);
          if (issue) {
            setError(issue.message);
            return;
          }
          clear();
          setError("");
          const url = URL.createObjectURL(file);
          const review = {
            audio: new Audio(url),
            name: file.name,
            result: {
              audioUrl: url,
              expiresAt: "9999-01-01T00:00:00Z",
              cached: false,
              originalName: file.name,
              loadAudio: async () => file,
              dispose: () => URL.revokeObjectURL(url)
            }
          };
          active.current = review;
          setMedia(review);
        }}
      />
      <Space wrap>
        <Button size="small" onClick={() => input.current?.click()}>
          导入参考音频
        </Button>
        {media && (
          <Button size="small" onClick={clear}>
            移除参考音频
          </Button>
        )}
        <Typography.Text type="secondary">
          仅本次对照审听，关闭后清除。
        </Typography.Text>
      </Space>
      {error && <Typography.Text type="danger">{error}</Typography.Text>}
      {media && (
        <AudioReview
          key={media.result.audioUrl}
          media={media}
          onPlay={onPlay}
        />
      )}
    </section>
  );
}

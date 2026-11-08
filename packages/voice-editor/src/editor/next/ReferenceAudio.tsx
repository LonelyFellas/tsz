import { useVoiceEditorTranslation } from "../i18n";
import { Button, Space, Typography } from "@tsz/ui/admin/display";
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioReview, type ReviewAudio } from "./AudioReview";
import {
  AUDIO_UPLOAD_ACCEPT,
  preflightAudioFile,
  audioFormatHint,
  audioSizeHint
} from "./audioAssets";

export function ReferenceAudio({
  onPlay,
  registerStop
}: {
  onPlay: () => void;
  registerStop?: (stop: () => void) => () => void;
}) {
  const { t } = useVoiceEditorTranslation();
  const input = useRef<HTMLInputElement>(null);
  const active = useRef<ReviewAudio | undefined>(undefined);
  const [media, setMedia] = useState<ReviewAudio>();
  const [error, setError] = useState<"unsupported_type" | "too_large">();
  const errorText =
    error === "unsupported_type"
      ? audioFormatHint(t)
      : error === "too_large"
        ? audioSizeHint(t)
        : "";
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
    <section
      className="tsz-ve-reference-audio"
      aria-label={t("reference_audio_for_this_session")}
    >
      <input
        ref={input}
        aria-label={t("import_reference_audio")}
        type="file"
        accept={AUDIO_UPLOAD_ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const issue = preflightAudioFile(file, undefined, t);
          if (issue) {
            setError(
              issue.code === "too_large" ? "too_large" : "unsupported_type"
            );
            return;
          }
          clear();
          setError(undefined);
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
        <Button
          size="small"
          title={t("used_only_in_this_session_cleared_on_close")}
          onClick={() => input.current?.click()}
        >
          {t("import_reference_audio")}
        </Button>
        {media && (
          <Button size="small" onClick={clear}>
            {t("remove_reference_audio")}
          </Button>
        )}
      </Space>
      {errorText && (
        <Typography.Text type="danger">{errorText}</Typography.Text>
      )}
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

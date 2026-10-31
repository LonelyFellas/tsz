"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/request";
import { AudioButton } from "@/features/audio/AudioButton";

export function LearningAnswerAudio({
  runId,
  questionId,
  userId,
  available,
  accent
}: {
  runId: string;
  questionId: string;
  userId: string;
  available: boolean;
  accent: "uk" | "us";
}) {
  const audio = useQuery({
    queryKey: ["learning", userId, "audio", runId, questionId, accent],
    enabled: available,
    retry: false,
    staleTime: 0,
    queryFn: ({ signal }) =>
      api.learning.audio(runId, questionId, accent, { signal })
  });
  return (
    <div className="mt-2 flex min-h-11 items-center gap-2 text-xs text-foreground-muted">
      {available && audio.isPending ? (
        "正在读取正式音频…"
      ) : !available || !audio.data?.audio ? (
        <span>
          {audio.isError ? (
            <>
              <span>正式音频读取失败</span>
              <button
                type="button"
                className="ml-2 min-h-11 text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                onClick={() => void audio.refetch()}
              >
                重试音频
              </button>
            </>
          ) : (
            "暂无可用的正式音频"
          )}
        </span>
      ) : (
        <>
          <span>{accent === "uk" ? "英式" : "美式"}发音</span>
          <AudioButton
            label="播放答案发音"
            resourceKey={`learning:${runId}:${questionId}:${accent}`}
            sign={async (signal) => {
              const result = await api.learning.audio(
                runId,
                questionId,
                accent,
                { signal }
              );
              if (!result.audio) throw new Error("正式音频暂不可用");
              return result.audio;
            }}
          />
        </>
      )}
    </div>
  );
}

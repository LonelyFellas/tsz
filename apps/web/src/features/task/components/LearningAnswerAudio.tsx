"use client";
import { localText, LocalWebError } from "@/i18n/catalog";

import { useWebText } from "@/i18n/client";
import { webTask } from "@/i18n/messages/task";

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
  const uiText = useWebText(webTask);
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
        uiText("webTask:loading_final_audio")
      ) : !available || !audio.data?.audio ? (
        <span>
          {audio.isError ? (
            <>
              <span>{uiText("webTask:could_not_load_published_audio")}</span>
              <button
                type="button"
                className="ml-2 min-h-11 text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                onClick={() => void audio.refetch()}
              >
                {uiText("webTask:retry_audio")}
              </button>
            </>
          ) : (
            uiText("webTask:no_published_audio_available")
          )}
        </span>
      ) : (
        <>
          <span>
            {accent === "uk"
              ? uiText("webTask:british")
              : uiText("webTask:american")}
            {uiText("webTask:pronunciation")}
          </span>
          <AudioButton
            label={uiText("webTask:play_answer_pronunciation")}
            resourceKey={`learning:${runId}:${questionId}:${accent}`}
            sign={async (signal) => {
              const result = await api.learning.audio(
                runId,
                questionId,
                accent,
                { signal }
              );
              if (!result.audio)
                throw new LocalWebError(
                  localText(webTask, "webTask:published_audio_is_unavailable")
                );
              return result.audio;
            }}
          />
        </>
      )}
    </div>
  );
}

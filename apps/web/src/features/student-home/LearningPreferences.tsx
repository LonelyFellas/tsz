"use client";
import { localText } from "@/i18n/catalog";
import { useWebText } from "@/i18n/client";
import { webStudentHomePreferences as webStudentHome } from "@/i18n/messages/student-home/preferences";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client";
import type { EnglishVariant, LearningSettings } from "@tsz/types";
import { Button } from "@tsz/ui/components";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { InterfaceLanguage } from "@/i18n/InterfaceLanguage";
import { ThemeModeControl } from "@/features/theme/ThemeModeControl";
import { wordListKeys } from "@/features/wordlist/hooks/useWordLists";

export function LearningPreferences({ userId }: { userId: string }) {
  const uiText = useWebText(webStudentHome);
  const client = useQueryClient();
  const [draft, setDraft] = useState<EnglishVariant | null>(null);
  const key = ["student-home", userId, "profile"];
  const profile = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api.auth.me({ signal }),
    refetchOnMount: "always"
  });
  const save = useMutation({
    mutationFn: (settings: LearningSettings) =>
      api.auth.updateLearningSettings(settings),
    onSuccess: (result) => {
      if (useUserStore.getState().user?.id !== userId) return;
      client.setQueryData(
        key,
        profile.data ? { ...profile.data, ...result } : undefined
      );
      setDraft(null);
      void client.invalidateQueries({ queryKey: wordListKeys.mine(userId) });
      void client.invalidateQueries({ queryKey: ["memory", userId] });
      void client.invalidateQueries({
        queryKey: ["learning-plans", userId, "v1", "preview"]
      });
    }
  });
  const settings = profile.data?.learning_settings;
  const variant = draft ?? settings?.english_variant;

  return (
    <div className="space-y-6">
      <ThemeModeControl />
      <InterfaceLanguage />
      <div>
        {profile.isPending ? (
          <p role="status">
            {uiText("webStudentHomePreferences:loading_learning_preferences")}
          </p>
        ) : profile.isError ? (
          <div role="alert" className="space-y-3 text-sm">
            <p>
              {uiText(
                "webStudentHomePreferences:could_not_load_learning_preferences_try_again"
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void profile.refetch()}
            >
              {uiText("webStudentHomePreferences:retry")}
            </Button>
          </div>
        ) : !settings ? (
          <Button asChild variant="outline">
            <Link href="/onboarding?redirect=%2Fstudent%2Fhome">
              {uiText("webStudentHomePreferences:complete_learning_settings")}
            </Link>
          </Button>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (
                !save.isPending &&
                variant &&
                variant !== settings.english_variant
              )
                save.mutate({
                  cefr_level: settings.cefr_level,
                  english_variant: variant
                });
            }}
          >
            <fieldset disabled={save.isPending} className="space-y-2">
              <legend className="ml-4 text-sm font-medium">
                {uiText("webStudentHomePreferences:english_preference")}
              </legend>
              <div className="grid grid-cols-2 gap-1 rounded-full border border-border/60 bg-muted p-1">
                {(
                  [
                    [
                      "BrE",
                      localText(
                        webStudentHome,
                        "webStudentHomePreferences:british_english"
                      )
                    ],
                    [
                      "AmE",
                      localText(
                        webStudentHome,
                        "webStudentHomePreferences:american_english"
                      )
                    ]
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="relative flex min-h-11 cursor-pointer items-center justify-center rounded-full text-[13px] font-medium text-foreground-muted transition-[color,background-color,box-shadow] duration-200 hover:text-foreground sm:min-h-9 has-checked:bg-surface has-checked:text-foreground has-checked:shadow-[0_2px_8px_rgb(0_0_0/0.06)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary"
                  >
                    <input
                      type="radio"
                      name="english-variant"
                      value={value}
                      checked={variant === value}
                      className="sr-only"
                      onChange={() => {
                        setDraft(value);
                        save.reset();
                      }}
                    />
                    {uiText(label)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="pl-4 text-xs text-foreground-muted">
              <p>
                {uiText("webStudentHomePreferences:current_level")}
                <span className="font-medium text-foreground">
                  {settings.cefr_level}
                </span>
              </p>
            </div>
            {save.isError && (
              <p role="alert" className="text-sm text-danger">
                {save.error instanceof HttpError &&
                save.error.code === "cefr_level_locked"
                  ? uiText(
                      "webStudentHomePreferences:your_level_was_confirmed_on_another_page_close_and_reopen_settings"
                    )
                  : uiText(
                      "webStudentHomePreferences:could_not_save_try_again"
                    )}
              </p>
            )}
            {save.isSuccess && (
              <p role="status" className="text-sm text-success">
                {uiText("webStudentHomePreferences:english_preference_saved")}
              </p>
            )}
            <div className="flex justify-end">
              <Button
                type="submit"
                variant={
                  variant === settings.english_variant ? "outline" : "default"
                }
                size="sm"
                className="min-h-11 sm:min-h-10"
                disabled={
                  save.isPending || variant === settings.english_variant
                }
              >
                {save.isPending
                  ? uiText("webStudentHomePreferences:saving")
                  : uiText(
                      "webStudentHomePreferences:save_learning_preferences"
                    )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

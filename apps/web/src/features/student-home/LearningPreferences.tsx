"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client";
import type { EnglishVariant, LearningSettings } from "@tsz/types";
import { Button } from "@tsz/ui/components";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { useTheme } from "@/features/theme/useTheme";
import { wordListKeys } from "@/features/wordlist/hooks/useWordLists";

export function LearningPreferences({ userId }: { userId: string }) {
  const { theme, setTheme } = useTheme();
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
    }
  });
  const settings = profile.data?.learning_settings;
  const variant = draft ?? settings?.english_variant;

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-3 text-sm font-medium">外观</legend>
        <div className="flex gap-1 rounded-full bg-muted p-1">
          {(
            [
              ["light", "浅色"],
              ["dark", "深色"],
              ["system", "跟随系统"]
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={theme === value ? "outline" : "ghost"}
              className="flex-1 px-2"
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </fieldset>
      <div className="border-t border-border pt-5">
        {profile.isPending ? (
          <p role="status">正在读取学习偏好…</p>
        ) : profile.isError ? (
          <div role="alert" className="space-y-3 text-sm">
            <p>学习偏好读取失败，请重试。</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void profile.refetch()}
            >
              重试
            </Button>
          </div>
        ) : !settings ? (
          <Button asChild variant="outline">
            <Link href="/onboarding?redirect=%2Fstudent%2Fhome">
              完成学习设置
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
            <fieldset disabled={save.isPending} className="space-y-3">
              <legend className="text-sm font-medium">英美偏好</legend>
              <p className="text-sm text-foreground-muted">
                当前难度：{settings.cefr_level}（首次确认后固定）
              </p>
              <div className="flex gap-4">
                {(
                  [
                    ["BrE", "英式英语"],
                    ["AmE", "美式英语"]
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex min-h-11 items-center gap-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="english-variant"
                      value={value}
                      checked={variant === value}
                      className="accent-primary"
                      onChange={() => {
                        setDraft(value);
                        save.reset();
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="text-xs leading-5 text-foreground-muted">
              已开始的练习保留本轮设置，新偏好用于之后开始的轮次。
            </p>
            {save.isError && (
              <p role="alert" className="text-sm text-danger">
                {save.error instanceof HttpError &&
                save.error.code === "cefr_level_locked"
                  ? "难度已在其他页面确认，请关闭并重新打开设置。"
                  : "保存失败，请重试。"}
              </p>
            )}
            {save.isSuccess && (
              <p role="status" className="text-sm text-success">
                英美偏好已保存
              </p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={save.isPending || variant === settings.english_variant}
            >
              {save.isPending ? "保存中…" : "保存偏好"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

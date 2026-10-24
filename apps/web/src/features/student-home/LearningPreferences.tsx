"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client";
import type { EnglishVariant, LearningSettings } from "@tsz/types";
import { Button } from "@tsz/ui/components";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { ThemeModeControl } from "@/features/theme/ThemeModeControl";
import { wordListKeys } from "@/features/wordlist/hooks/useWordLists";

export function LearningPreferences({ userId }: { userId: string }) {
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
      <div className="border-t border-border/70 pt-5">
        <p className="mb-3 text-xs font-medium tracking-[0.2em] text-foreground-muted">
          学习偏好
        </p>
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
              <div className="grid grid-cols-2 gap-1 rounded-full border border-border/60 bg-muted p-1">
                {(
                  [
                    ["BrE", "英式英语"],
                    ["AmE", "美式英语"]
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="relative flex min-h-10 cursor-pointer items-center justify-center rounded-full text-[13px] font-medium text-foreground-muted transition-[color,background-color,box-shadow] duration-200 hover:text-foreground has-checked:bg-surface has-checked:text-foreground has-checked:shadow-[0_2px_8px_rgb(0_0_0/0.06)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary"
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

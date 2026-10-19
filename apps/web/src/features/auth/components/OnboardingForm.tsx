"use client";

import { HttpError } from "@tsz/api-client";
import type { CEFRLevel, EnglishVariant } from "@tsz/types";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { translateAuthError } from "../shared";
import { cn } from "@tsz/ui/lib/cn";
import { BrandMark } from "@/features/home/components/BrandMark";
import { buttonClass, primaryButtonClass } from "@/features/shell/Page";

const LEVELS: {
  level: CEFRLevel;
  stage: string;
  band?: string;
}[] = [
  { level: "C2", stage: "英专", band: "高级" },
  { level: "C1", stage: "英专" },
  { level: "B2", stage: "高中", band: "中级" },
  { level: "B1", stage: "高中" },
  { level: "A2", stage: "初中", band: "初级" },
  { level: "A1", stage: "小学", band: "入门" }
];

const VARIANTS: {
  variant: EnglishVariant;
  short: string;
  label: string;
}[] = [
  { variant: "BrE", short: "BrE", label: "英式英语" },
  { variant: "AmE", short: "AmE", label: "美式英语" }
];

const OPTION_CLASS =
  "flex items-center gap-4 rounded-2xl border bg-surface transition-[border-color,background-color,box-shadow] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary";

const ONBOARDING_ERRORS: Record<string, string> = {
  "learning settings require a student profile":
    "当前账号没有学生身份，无法设置学习偏好"
};

interface OnboardingFormProps {
  initialLevel?: CEFRLevel;
  returnTo?: string;
}

export function OnboardingForm({
  initialLevel,
  returnTo = "/"
}: OnboardingFormProps = {}) {
  const [level, setLevel] = useState<CEFRLevel | null>(initialLevel ?? null);
  const [variant, setVariant] = useState<EnglishVariant | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const setOnboarded = useUserStore((s) => s.setOnboarded);
  const router = useRouter();
  const canSubmit = level !== null && variant !== null && !loading;

  async function handleSubmit() {
    if (!confirming || !canSubmit || level === null || variant === null) return;
    setError("");
    setLoading(true);
    try {
      const result = await api.auth.updateLearningSettings({
        cefr_level: level,
        english_variant: variant
      });
      setOnboarded(result.onboarded);
      router.replace(returnTo);
    } catch (e: unknown) {
      if (e instanceof HttpError && e.code === "cefr_level_locked") {
        const current = await api.auth.me().catch(() => null);
        if (current?.onboarded) {
          useUserStore.getState().setSession(current.user, current.onboarded);
          router.replace("/account/profile");
          return;
        }
        setError("难度已在其他页面确认，请刷新查看已保存的配置。");
      } else {
        const msg = e instanceof Error ? e.message : "";
        setError(
          translateAuthError(msg, ONBOARDING_ERRORS, "保存失败，请稍后重试")
        );
      }
    } finally {
      setLoading(false);
    }
  }

  const locked = confirming || loading;
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-3 sm:px-5">
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2.5 rounded-full px-3 text-base font-bold tracking-tight text-foreground transition-colors hover:bg-surface/80 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <BrandMark />
            天生会背
          </Link>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full bg-muted px-3 py-1.5 text-foreground-muted">
              {variant === null
                ? "待选择"
                : variant === "AmE"
                  ? "美式"
                  : "英式"}
            </span>
            <Link
              href="/account"
              className="glass inline-flex h-9 items-center rounded-full px-4 text-[13px] font-medium tracking-wide text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              个人中心
            </Link>
          </div>
        </div>
      </header>

      <main className="animate-in mx-auto max-w-5xl px-6 pb-16 pt-8 sm:pt-12">
        <p className="mb-3 text-xs font-medium tracking-[0.2em] text-foreground-muted">
          新手引导
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-[34px]">
          先确定你的学习起点
        </h1>
        <p className="mb-8 mt-3 max-w-xl text-sm leading-6 text-foreground-muted">
          选择适合自己的难度，再确定习惯的英语发音与拼写。
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <section className="glass rounded-3xl p-2">
            <div className="h-full rounded-[20px] bg-surface/70 p-6 sm:p-8">
              <h2 className="text-xl font-semibold tracking-tight">
                1. 选择难度级别
              </h2>
              <p className="mt-3 text-sm leading-6 text-foreground-muted">
                根据自身水平选择。难度首次确认后不可修改，请慎重选择。
              </p>
              <Link
                href={
                  returnTo === "/"
                    ? "/placement"
                    : `/placement?redirect=${encodeURIComponent(returnTo)}`
                }
                className="mt-2 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                不确定选哪个？1 分钟测一测
              </Link>
              <div
                className="mt-6 space-y-2"
                role="radiogroup"
                aria-label="难度级别"
              >
                {LEVELS.map(({ level: lv, stage, band }) => {
                  const active = level === lv;
                  return (
                    <label
                      key={lv}
                      className={cn(
                        OPTION_CLASS,
                        "min-h-14 px-3 py-2",
                        active
                          ? "border-primary/40 bg-primary-muted"
                          : "border-border/60 hover:border-primary/30",
                        locked ? "cursor-default" : "cursor-pointer"
                      )}
                    >
                      <input
                        type="radio"
                        name="cefr-level"
                        value={lv}
                        checked={active}
                        onChange={() => setLevel(lv)}
                        disabled={locked}
                        className="sr-only"
                      />
                      <span className="w-8 shrink-0 text-xs text-foreground-muted">
                        {band ?? ""}
                      </span>
                      <span
                        className={cn(
                          "flex h-10 w-14 shrink-0 items-center justify-center rounded-xl text-lg font-bold tabular-nums transition-colors",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        )}
                      >
                        {lv}
                      </span>
                      <span className="text-sm text-foreground-muted">
                        {stage}
                      </span>
                      {active && (
                        <span className="ml-auto pr-2 text-xs font-medium text-primary">
                          已选
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="mt-4 text-xs leading-5 text-foreground-muted">
                学段仅作参考，请以实际英语水平为准。
              </p>
              <details className="mt-5 rounded-2xl border border-border/60 bg-muted/70 px-4 py-3 text-sm text-foreground-muted">
                <summary className="cursor-pointer font-medium text-primary">
                  什么是 CEFR 难度等级？
                </summary>
                <p className="mt-2 text-xs leading-6">
                  CEFR 是欧洲语言共同参考框架。A1、A2 为基础使用，B1、B2
                  为独立使用，C1、C2 为熟练使用；由 A1 到 C2，难度逐级提高。
                </p>
              </details>
            </div>
          </section>

          <section className="glass rounded-3xl p-2">
            <div className="flex h-full flex-col rounded-[20px] bg-surface/70 p-6 sm:p-8">
              <h2 className="text-xl font-semibold tracking-tight">
                2. 英式还是美式？
              </h2>
              <p className="mt-3 text-sm leading-6 text-foreground-muted">
                选择你习惯的英语发音和拼写。英美偏好之后可以在个人中心修改。
              </p>
              <div
                className="mt-6 space-y-3"
                role="radiogroup"
                aria-label="英美偏好"
              >
                {VARIANTS.map(({ variant: v, short, label }) => {
                  const active = variant === v;
                  return (
                    <label
                      key={v}
                      className={cn(
                        OPTION_CLASS,
                        "min-h-16 px-5 py-4",
                        active
                          ? "border-primary/40 bg-primary-muted text-primary"
                          : "border-border/60 text-foreground hover:border-primary/30",
                        locked ? "cursor-default" : "cursor-pointer"
                      )}
                    >
                      <input
                        type="radio"
                        name="english-variant"
                        value={v}
                        checked={active}
                        onChange={() => setVariant(v)}
                        disabled={locked}
                        className="sr-only"
                      />
                      <span className="text-xl font-bold tracking-tight">
                        {short}
                      </span>
                      <span className="text-base font-medium">{label}</span>
                      {active && (
                        <span className="ml-auto text-sm font-medium">
                          已选
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="mt-5 text-xs leading-6 text-foreground-muted">
                BrE = British English（英式英语）；AmE = American
                English（美式英语）。请选择其中一种作为个人偏好。
              </p>
              <div className="mt-auto pt-8">
                {error && (
                  <p
                    role="alert"
                    className="mb-4 text-sm leading-6 text-danger"
                  >
                    {error}
                  </p>
                )}
                {confirming ? (
                  <section
                    aria-label="确认学习配置"
                    className="rounded-2xl border border-border/60 bg-muted/70 p-4"
                  >
                    <p className="text-sm font-semibold">确认你的学习配置</p>
                    <p className="mt-2 text-sm text-foreground-muted">
                      难度 {level}，
                      {variant === "AmE" ? "美式英语" : "英式英语"}。
                    </p>
                    <p className="mt-2 text-xs leading-6 text-foreground-muted">
                      难度确认后不可修改；英美偏好之后仍可调整。
                    </p>
                    <div className="mt-4 flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirming(false);
                          setError("");
                        }}
                        disabled={loading}
                        className={cn(buttonClass, "min-h-12 px-5")}
                      >
                        返回调整
                      </button>
                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className={cn(primaryButtonClass, "flex-1 px-4")}
                      >
                        {loading ? "保存中..." : "确认并开始学习"}
                      </button>
                    </div>
                  </section>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    disabled={!canSubmit}
                    className={cn(primaryButtonClass, "w-full")}
                  >
                    完成，开始学习
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

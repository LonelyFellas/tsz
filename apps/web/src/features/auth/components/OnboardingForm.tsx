"use client";

import { HttpError } from "@tsz/api-client";
import type { CEFRLevel, EnglishVariant } from "@tsz/types";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { translateAuthError } from "../shared";

const LEVELS: {
  level: CEFRLevel;
  color: string;
  stage: string;
  band?: string;
}[] = [
  { level: "C2", color: "bg-rose-700", stage: "英专", band: "高级" },
  { level: "C1", color: "bg-rose-600", stage: "英专" },
  { level: "B2", color: "bg-violet-700", stage: "高中", band: "中级" },
  { level: "B1", color: "bg-violet-600", stage: "高中" },
  { level: "A2", color: "bg-blue-600", stage: "初中", band: "初级" },
  { level: "A1", color: "bg-blue-700", stage: "小学", band: "入门" }
];

const VARIANTS: {
  variant: EnglishVariant;
  short: string;
  label: string;
  color: string;
}[] = [
  { variant: "BrE", short: "BrE", label: "英式英语", color: "bg-primary" },
  { variant: "AmE", short: "AmE", label: "美式英语", color: "bg-rose-600" }
];

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            天生会背
          </Link>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-foreground-muted">
              {variant === null
                ? "待选择"
                : variant === "AmE"
                  ? "美式"
                  : "英式"}
            </span>
            <Link href="/account" className="text-primary hover:underline">
              个人中心
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          先确定你的学习起点
        </h1>
        <p className="mb-8 text-sm leading-6 text-foreground-muted">
          选择适合自己的难度，再确定习惯的英语发音与拼写。
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
            <h2 className="text-xl font-semibold">1. 选择难度级别</h2>
            <p className="mt-3 text-sm leading-6 text-foreground-muted">
              根据自身水平选择。难度首次确认后不可修改，请慎重选择。
            </p>
            <Link
              href={
                returnTo === "/"
                  ? "/placement"
                  : `/placement?redirect=${encodeURIComponent(returnTo)}`
              }
              className="mt-2 inline-block text-sm text-primary hover:underline"
            >
              不确定选哪个？1 分钟测一测
            </Link>
            <div
              className="mt-6 space-y-1"
              role="radiogroup"
              aria-label="难度级别"
            >
              {LEVELS.map(({ level: lv, color, stage, band }) => {
                const active = level === lv;
                return (
                  <label
                    key={lv}
                    className={`flex min-h-14 items-center gap-4 rounded-xl border px-3 py-2 transition-colors focus-within:ring-2 focus-within:ring-primary/50 ${
                      active
                        ? "border-primary bg-primary-muted"
                        : "border-transparent hover:bg-muted"
                    } ${confirming || loading ? "cursor-default" : "cursor-pointer"}`}
                  >
                    <input
                      type="radio"
                      name="cefr-level"
                      value={lv}
                      checked={active}
                      onChange={() => setLevel(lv)}
                      disabled={confirming || loading}
                      className="sr-only"
                    />
                    <span className="w-8 shrink-0 text-xs text-foreground-muted">
                      {band ?? ""}
                    </span>
                    <span
                      className={`flex h-10 w-14 shrink-0 items-center justify-center rounded-lg text-lg font-bold text-white ${color}`}
                    >
                      {lv}
                    </span>
                    <span className="text-sm text-foreground-muted">
                      {stage}
                    </span>
                    {active && (
                      <span className="ml-auto text-xs font-medium text-primary">
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
            <details className="mt-5 text-sm text-foreground-muted">
              <summary className="cursor-pointer text-primary">
                什么是 CEFR 难度等级？
              </summary>
              <p className="mt-2 text-xs leading-6">
                CEFR 是欧洲语言共同参考框架。A1、A2 为基础使用，B1、B2
                为独立使用，C1、C2 为熟练使用；由 A1 到 C2，难度逐级提高。
              </p>
            </details>
          </section>

          <section className="flex flex-col rounded-3xl border border-border bg-surface p-6 sm:p-8">
            <h2 className="text-xl font-semibold">2. 英式还是美式？</h2>
            <p className="mt-3 text-sm leading-6 text-foreground-muted">
              选择你习惯的英语发音和拼写。英美偏好之后可以在个人中心修改。
            </p>
            <div
              className="mt-6 space-y-4"
              role="radiogroup"
              aria-label="英美偏好"
            >
              {VARIANTS.map(({ variant: v, short, label, color }) => {
                const active = variant === v;
                return (
                  <label
                    key={v}
                    className={`flex min-h-16 items-center gap-3 rounded-xl px-5 py-4 text-white focus-within:ring-4 focus-within:ring-primary/40 ${color} ${
                      active
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-surface"
                        : ""
                    } ${confirming || loading ? "cursor-default" : "cursor-pointer"}`}
                  >
                    <input
                      type="radio"
                      name="english-variant"
                      value={v}
                      checked={active}
                      onChange={() => setVariant(v)}
                      disabled={confirming || loading}
                      className="sr-only"
                    />
                    <span className="text-xl font-semibold">{short}</span>
                    <span className="text-lg font-semibold">{label}</span>
                    {active && <span className="ml-auto text-sm">已选</span>}
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
                <p role="alert" className="mb-4 text-sm leading-6 text-danger">
                  {error}
                </p>
              )}
              {confirming ? (
                <section
                  aria-label="确认学习配置"
                  className="rounded-2xl border border-border bg-muted/50 p-4"
                >
                  <p className="text-sm font-semibold">确认你的学习配置</p>
                  <p className="mt-2 text-sm text-foreground-muted">
                    难度 {level}，{variant === "AmE" ? "美式英语" : "英式英语"}
                    。
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
                      className="rounded-xl border border-border px-4 py-3 text-sm disabled:opacity-50"
                    >
                      返回调整
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!canSubmit}
                      className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
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
                  className="w-full rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  完成，开始学习
                </button>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

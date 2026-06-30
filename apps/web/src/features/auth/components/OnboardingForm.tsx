"use client";

import type { CEFRLevel, EnglishVariant } from "@tsz/api-client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { translateAuthError } from "../shared";

// CEFR 难度阶梯（从高到低展示）。color 为徽章底色，stage 为对应学龄段。
const LEVELS: {
  level: CEFRLevel;
  color: string;
  stage: string;
  band?: string;
}[] = [
  { level: "C2", color: "bg-pink-500", stage: "英专", band: "高级" },
  { level: "C1", color: "bg-pink-400", stage: "英专" },
  { level: "B2", color: "bg-violet-600", stage: "高中", band: "中级" },
  { level: "B1", color: "bg-purple-500", stage: "初中" },
  { level: "A2", color: "bg-blue-500", stage: "初中", band: "初级" },
  { level: "A1", color: "bg-blue-600", stage: "小学", band: "入门" }
];

const VARIANTS: {
  variant: EnglishVariant;
  short: string;
  label: string;
  color: string;
}[] = [
  { variant: "BrE", short: "BrE", label: "英式英语", color: "bg-primary" },
  { variant: "AmE", short: "AmE", label: "美式英语", color: "bg-pink-500" }
];

const ONBOARDING_ERRORS: Record<string, string> = {
  "learning settings require a student profile":
    "当前账号没有学生身份，无法设置学习偏好"
};

export function OnboardingForm() {
  const [level, setLevel] = useState<CEFRLevel | null>(null);
  const [variant, setVariant] = useState<EnglishVariant | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const setOnboarded = useUserStore((s) => s.setOnboarded);
  const router = useRouter();

  const canSubmit = level !== null && variant !== null && !loading;

  async function handleSubmit() {
    if (!canSubmit || level === null || variant === null) return;
    setError("");
    setLoading(true);
    try {
      await api.auth.updateLearningSettings({
        cefr_level: level,
        english_variant: variant
      });
      setOnboarded(true);
      router.push("/");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      setError(
        translateAuthError(msg, ONBOARDING_ERRORS, "保存失败，请稍后重试")
      );
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted px-4 py-8">
      {/* 顶部品牌栏 */}
      <header className="mx-auto mb-8 flex max-w-5xl items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📖</span>
          <span className="text-xl font-bold">天生会背</span>
        </div>
        <span className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-white">
          {variant === "AmE" ? "美式" : "英式"}
        </span>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
        {/* 卡片 1：选择难度级别 */}
        <section className="rounded-2xl bg-surface p-8 shadow-sm">
          <h2 className="mb-3 text-xl font-bold">1. 选择难度级别</h2>
          <p className="mb-6 text-sm leading-relaxed text-foreground-muted">
            必须根据自身水平，选择适合的难度级别，才能将正确的学习内容适配给你。
          </p>

          <div className="space-y-2">
            {LEVELS.map(({ level: lv, color, stage, band }) => {
              const active = level === lv;
              return (
                <button
                  key={lv}
                  type="button"
                  onClick={() => setLevel(lv)}
                  className={`flex w-full items-center gap-4 rounded-xl border-2 px-3 py-2 text-left transition-colors ${
                    active
                      ? "border-primary bg-primary-muted"
                      : "border-transparent hover:bg-muted"
                  }`}
                >
                  <span className="w-8 shrink-0 text-right text-xs text-foreground-subtle">
                    {band ?? ""}
                  </span>
                  <span
                    className={`flex h-11 w-14 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white ${color}`}
                  >
                    {lv}
                  </span>
                  <span className="text-sm text-foreground-muted">{stage}</span>
                  {active && (
                    <span className="ml-auto text-sm font-medium text-primary">
                      已选
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="mt-6 text-xs leading-relaxed text-foreground-subtle">
            * A1 / A2 / B1 / B2 / C1 / C2 是什么难度等级？什么是 CEFR？
          </p>
        </section>

        {/* 卡片 2：英式 or 美式 */}
        <section className="flex flex-col rounded-2xl bg-surface p-8 shadow-sm">
          <h2 className="mb-3 text-xl font-bold">2. 英式 or 美式？</h2>
          <p className="mb-6 text-sm leading-relaxed text-foreground-muted">
            只能二选一，否则无法确认正确的发音和拼写形式，然后才能开启“天生会背”之旅。
          </p>

          <div className="space-y-4">
            {VARIANTS.map(({ variant: v, short, label, color }) => {
              const active = variant === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVariant(v)}
                  className={`flex w-full items-center gap-3 rounded-xl px-6 py-4 text-left text-xl font-bold text-white transition-all ${color} ${
                    active
                      ? "ring-4 ring-offset-2 ring-primary/50"
                      : "opacity-90 hover:opacity-100"
                  }`}
                >
                  <span>{short}</span>
                  <span className="text-lg">{label}</span>
                  {active && <span className="ml-auto text-base">✓</span>}
                </button>
              );
            })}
          </div>

          <p className="mt-6 text-xs leading-relaxed text-foreground-subtle">
            *
            选择“英式英语”，则所有英语发音都是英式发音，所有单词拼写都是英式拼写；选择“美式英语”，则发音和拼写都为美式。
            <br />
            ** BrE = British English（英式英语，不列颠英语）；AmE = American
            English（美式英语）。
          </p>

          <div className="mt-auto pt-8">
            {error && <p className="mb-3 text-sm text-danger">{error}</p>}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full rounded-full bg-primary py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "保存中..." : "完成，开始学习"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

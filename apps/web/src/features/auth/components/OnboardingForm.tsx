"use client";
import { localText, type WebNotice } from "@/i18n/catalog";

import { useWebText } from "@/i18n/client";
import { webAuthOnboarding as webAuth } from "@/i18n/messages/auth/onboarding";

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
  stage: WebNotice;
  band?: WebNotice;
}[] = [
  {
    level: "C2",
    stage: localText(webAuth, "webAuthOnboarding:english_degree"),
    band: localText(webAuth, "webAuthOnboarding:advanced")
  },
  {
    level: "C1",
    stage: localText(webAuth, "webAuthOnboarding:english_degree")
  },
  {
    level: "B2",
    stage: localText(webAuth, "webAuthOnboarding:senior_secondary"),
    band: localText(webAuth, "webAuthOnboarding:intermediate")
  },
  {
    level: "B1",
    stage: localText(webAuth, "webAuthOnboarding:senior_secondary")
  },
  {
    level: "A2",
    stage: localText(webAuth, "webAuthOnboarding:lower_secondary"),
    band: localText(webAuth, "webAuthOnboarding:elementary")
  },
  {
    level: "A1",
    stage: localText(webAuth, "webAuthOnboarding:primary_school"),
    band: localText(webAuth, "webAuthOnboarding:beginner")
  }
];

const VARIANTS: {
  variant: EnglishVariant;
  short: string;
  label: WebNotice;
}[] = [
  {
    variant: "BrE",
    short: "BrE",
    label: localText(webAuth, "webAuthOnboarding:british_english")
  },
  {
    variant: "AmE",
    short: "AmE",
    label: localText(webAuth, "webAuthOnboarding:american_english")
  }
];

const OPTION_CLASS =
  "flex items-center gap-4 rounded-2xl border bg-surface transition-[border-color,background-color,box-shadow] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary";

const ONBOARDING_ERRORS: Record<string, WebNotice> = {
  "learning settings require a student profile": localText(
    webAuth,
    "webAuthOnboarding:this_account_needs_a_student_role_to_set_learning_preferences"
  )
};

interface OnboardingFormProps {
  initialLevel?: CEFRLevel;
  returnTo?: string;
}

export function OnboardingForm({
  initialLevel,
  returnTo = "/"
}: OnboardingFormProps = {}) {
  const uiText = useWebText(webAuth);
  const [level, setLevel] = useState<CEFRLevel | null>(initialLevel ?? null);
  const [variant, setVariant] = useState<EnglishVariant | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<WebNotice>("");
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
        setError(
          localText(
            webAuth,
            "webAuthOnboarding:your_level_was_confirmed_on_another_page_reload_to_view_the_saved_settin"
          )
        );
      } else {
        setError(
          translateAuthError(
            e instanceof Error ? e : "",
            ONBOARDING_ERRORS,
            localText(
              webAuth,
              "webAuthOnboarding:could_not_save_try_again_later"
            )
          )
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
            {uiText("webAuthOnboarding:brand")}
          </Link>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full bg-muted px-3 py-1.5 text-foreground-muted">
              {variant === null
                ? uiText("webAuthOnboarding:not_selected")
                : variant === "AmE"
                  ? uiText("webAuthOnboarding:american")
                  : uiText("webAuthOnboarding:british")}
            </span>
            <Link
              href="/account"
              className="glass inline-flex h-9 items-center rounded-full px-4 text-[13px] font-medium tracking-wide text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              {uiText("webAuthOnboarding:account")}
            </Link>
          </div>
        </div>
      </header>

      <main className="animate-in mx-auto max-w-5xl px-6 pb-16 pt-8 sm:pt-12">
        <p className="mb-3 text-xs font-medium tracking-[0.2em] text-foreground-muted">
          {uiText("webAuthOnboarding:getting_started")}
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-[34px]">
          {uiText("webAuthOnboarding:choose_your_starting_level")}
        </h1>
        <p className="mb-8 mt-3 max-w-xl text-sm leading-6 text-foreground-muted">
          {uiText(
            "webAuthOnboarding:choose_a_suitable_level_and_your_preferred_english_pronunciation_and_spe"
          )}
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <section className="glass rounded-3xl p-2">
            <div className="h-full rounded-[20px] bg-surface/70 p-6 sm:p-8">
              <h2 className="text-xl font-semibold tracking-tight">
                {uiText("webAuthOnboarding:1_choose_a_difficulty_level")}
              </h2>
              <p className="mt-3 text-sm leading-6 text-foreground-muted">
                {uiText(
                  "webAuthOnboarding:choose_according_to_your_ability_the_level_cannot_be_changed_once_confir"
                )}
              </p>
              <Link
                href={
                  returnTo === "/"
                    ? "/placement"
                    : `/placement?redirect=${encodeURIComponent(returnTo)}`
                }
                className="mt-2 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {uiText(
                  "webAuthOnboarding:not_sure_take_a_one_minute_assessment"
                )}
              </Link>
              <div
                className="mt-6 space-y-2"
                role="radiogroup"
                aria-label={uiText("webAuthOnboarding:difficulty_level")}
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
                        aria-label={[uiText(band ?? ""), lv, uiText(stage)]
                          .filter(Boolean)
                          .join(" ")}
                        value={lv}
                        checked={active}
                        onChange={() => setLevel(lv)}
                        disabled={locked}
                        className="sr-only"
                      />
                      <span className="w-8 shrink-0 text-xs text-foreground-muted">
                        {uiText(band ?? "")}
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
                        {uiText(stage)}
                      </span>
                      {active && (
                        <span
                          aria-hidden="true"
                          className="ml-auto pr-2 text-xs font-medium text-primary"
                        >
                          {uiText("webAuthOnboarding:selected")}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="mt-4 text-xs leading-5 text-foreground-muted">
                {uiText(
                  "webAuthOnboarding:school_stages_are_a_guide_choose_based_on_your_english_ability"
                )}
              </p>
              <details className="mt-5 rounded-2xl border border-border/60 bg-muted/70 px-4 py-3 text-sm text-foreground-muted">
                <summary className="cursor-pointer font-medium text-primary">
                  {uiText("webAuthOnboarding:what_are_cefr_levels")}
                </summary>
                <p className="mt-2 text-xs leading-6">
                  {uiText(
                    "webAuthOnboarding:cefr_is_the_common_european_framework_of_reference_for_languages_a1_and"
                  )}
                </p>
              </details>
            </div>
          </section>

          <section className="glass rounded-3xl p-2">
            <div className="flex h-full flex-col rounded-[20px] bg-surface/70 p-6 sm:p-8">
              <h2 className="text-xl font-semibold tracking-tight">
                {uiText("webAuthOnboarding:2_british_or_american_english")}
              </h2>
              <p className="mt-3 text-sm leading-6 text-foreground-muted">
                {uiText(
                  "webAuthOnboarding:choose_your_preferred_pronunciation_and_spelling_you_can_change_this_lat"
                )}
              </p>
              <div
                className="mt-6 space-y-3"
                role="radiogroup"
                aria-label={uiText("webAuthOnboarding:english_preference")}
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
                        aria-label={`${short} ${uiText(label)}`}
                        value={v}
                        checked={active}
                        onChange={() => setVariant(v)}
                        disabled={locked}
                        className="sr-only"
                      />
                      <span className="text-xl font-bold tracking-tight">
                        {short}
                      </span>
                      <span className="text-base font-medium">
                        {uiText(label)}
                      </span>
                      {active && (
                        <span
                          aria-hidden="true"
                          className="ml-auto text-sm font-medium"
                        >
                          {uiText("webAuthOnboarding:selected")}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="mt-5 text-xs leading-6 text-foreground-muted">
                {uiText(
                  "webAuthOnboarding:bre_means_british_english_ame_means_american_english_choose_one_as_your"
                )}
              </p>
              <div className="mt-auto pt-8">
                {error && (
                  <p
                    role="alert"
                    className="mb-4 text-sm leading-6 text-danger"
                  >
                    {uiText(error)}
                  </p>
                )}
                {confirming ? (
                  <section
                    aria-label={uiText(
                      "webAuthOnboarding:confirm_learning_settings"
                    )}
                    className="rounded-2xl border border-border/60 bg-muted/70 p-4"
                  >
                    <p className="text-sm font-semibold">
                      {uiText(
                        "webAuthOnboarding:confirm_your_learning_settings"
                      )}
                    </p>
                    <p className="mt-2 text-sm text-foreground-muted">
                      {uiText("webAuthOnboarding:level")} {level} ·
                      {variant === "AmE"
                        ? uiText("webAuthOnboarding:american_english")
                        : uiText("webAuthOnboarding:british_english")}
                    </p>
                    <p className="mt-2 text-xs leading-6 text-foreground-muted">
                      {uiText(
                        "webAuthOnboarding:your_level_cannot_be_changed_once_confirmed_your_english_preference_can"
                      )}
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
                        {uiText("webAuthOnboarding:go_back")}
                      </button>
                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className={cn(primaryButtonClass, "flex-1 px-4")}
                      >
                        {loading
                          ? uiText("webAuthOnboarding:saving")
                          : uiText(
                              "webAuthOnboarding:confirm_and_start_learning"
                            )}
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
                    {uiText("webAuthOnboarding:done_start_learning")}
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

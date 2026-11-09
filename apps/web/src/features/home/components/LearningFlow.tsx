"use client";

import { localText } from "@/i18n/catalog";
import { useWebText } from "@/i18n/client";
import { webHomeLanding as webHome } from "@/i18n/messages/home/landing";
import { SectionHeading } from "./SectionHeading";

const STEPS = [
  {
    step: "01",
    title: localText(webHome, "webHomeLanding:choose_word_lists_2"),
    desc: localText(
      webHome,
      "webHomeLanding:browse_or_create_word_lists_to_choose_what_to_learn"
    )
  },
  {
    step: "02",
    title: localText(webHome, "webHomeLanding:create_a_task"),
    desc: localText(
      webHome,
      "webHomeLanding:create_daily_or_long_term_tasks_for_your_goals"
    )
  },
  {
    step: "03",
    title: localText(webHome, "webHomeLanding:practise"),
    desc: localText(
      webHome,
      "webHomeLanding:complete_daily_practice_using_the_memory_schedule"
    )
  },
  {
    step: "04",
    title: localText(webHome, "webHomeLanding:daily_check_in"),
    desc: localText(webHome, "webHomeLanding:keep_checking_in_to_earn")
  }
] as const;

export function LearningFlow() {
  const uiText = useWebText(webHome);
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
      <SectionHeading
        title={uiText("webHomeLanding:from_your_first_word_to_a_daily_habit")}
        desc={uiText("webHomeLanding:build_a_learning_routine_you_can_keep")}
      />
      <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ step, title, desc }) => (
          <li
            key={step}
            className="grid grid-cols-[44px_minmax(0,1fr)] items-start gap-x-4 sm:block"
          >
            <div className="row-span-2 flex items-center gap-4" aria-hidden>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums text-foreground-muted">
                {step}
              </span>
              <span className="hidden h-px flex-1 bg-border sm:block" />
            </div>
            <h3 className="text-lg font-semibold text-foreground sm:mt-5">
              {uiText(title)}
            </h3>
            <p className="mt-2 text-sm leading-6 text-foreground-muted">
              {uiText(desc)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

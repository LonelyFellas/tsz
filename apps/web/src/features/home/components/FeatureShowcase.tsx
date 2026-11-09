"use client";

import { localText } from "@/i18n/catalog";
import { useWebText } from "@/i18n/client";
import { webHomeLanding as webHome } from "@/i18n/messages/home/landing";
import { ChartNoAxesCombined, Coins, ListChecks, Users } from "lucide-react";
import { MemoryVisual, WordbankVisual } from "./featureVisuals";
import { SectionHeading } from "./SectionHeading";

const FEATURES = [
  {
    Icon: ListChecks,
    title: localText(webHome, "webHomeLanding:task_based_learning"),
    desc: localText(
      webHome,
      "webHomeLanding:create_daily_or_long_term_tasks_and_practise_according_to_your_plan"
    )
  },
  {
    Icon: ChartNoAxesCombined,
    title: localText(webHome, "webHomeLanding:learning_statistics"),
    desc: localText(webHome, "webHomeLanding:see_your_progress_and_accuracy")
  },
  {
    Icon: Users,
    title: localText(webHome, "webHomeLanding:class_management"),
    desc: localText(
      webHome,
      "webHomeLanding:classes_are_coming_later_teachers_can_organise_teaching_word_lists_now"
    )
  },
  {
    Icon: Coins,
    title: localText(webHome, "webHomeLanding:rewards"),
    desc: localText(
      webHome,
      "webHomeLanding:earn_through_practice_and_check_ins"
    )
  }
];

export function FeatureShowcase() {
  const uiText = useWebText(webHome);
  return (
    <section className="bg-muted py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-6">
        <SectionHeading
          title={uiText("webHomeLanding:a_plan_for_learning")}
          desc={uiText("webHomeLanding:from_choosing_words_to_practising_them")}
        />
        <div className="grid gap-6 md:grid-cols-2">
          <article className="rounded-3xl bg-surface p-6 sm:p-10">
            <h3 className="text-2xl font-semibold tracking-tight text-foreground">
              {uiText("webHomeLanding:scheduled_review")}
            </h3>
            <p className="mt-2 text-sm leading-6 text-foreground-muted">
              {uiText(
                "webHomeLanding:review_using_the_forgetting_curve_to_help_words_stay_with_you"
              )}
            </p>
            <div className="mt-8">
              <MemoryVisual />
            </div>
          </article>
          <article className="rounded-3xl bg-surface p-6 sm:p-10">
            <h3 className="text-2xl font-semibold tracking-tight text-foreground">
              {uiText("webHomeLanding:word_list_library")}
            </h3>
            <p className="mt-2 text-sm leading-6 text-foreground-muted">
              {uiText(
                "webHomeLanding:textbook_word_lists_with_options_to_create_and_share_your_own"
              )}
            </p>
            <div className="mt-8">
              <WordbankVisual />
            </div>
          </article>
        </div>
        <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ Icon, title, desc }) => (
            <li key={title.key} className="border-t border-border/70 pt-6">
              <Icon
                className="size-6 text-primary"
                strokeWidth={1.5}
                aria-hidden
              />
              <h3 className="mt-4 text-base font-semibold text-foreground">
                {uiText(title)}
              </h3>
              <p className="mt-2 text-sm leading-6 text-foreground-muted">
                {uiText(desc)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

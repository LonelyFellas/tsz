"use client";

import { useWebText } from "@/i18n/client";
import { webHomeLanding as webHome } from "@/i18n/messages/home/landing";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@tsz/ui/components";
import { SectionHeading } from "./SectionHeading";

export function RoleEntry() {
  const uiText = useWebText(webHome);
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-20 pt-8 sm:pb-24">
      <SectionHeading
        title={uiText("webHomeLanding:a_place_to_teach_and_learn")}
        desc={uiText(
          "webHomeLanding:learn_towards_your_goals_and_support_your_students"
        )}
      />
      <div className="grid gap-6 md:grid-cols-2">
        <article className="flex flex-col items-start rounded-3xl bg-muted p-8 sm:p-10">
          <p className="text-sm font-medium text-foreground-muted">
            {uiText("webHomeLanding:for_students")}
          </p>
          <h3 className="mt-4 text-3xl font-semibold tracking-tight">
            {uiText("webHomeLanding:learn_at_your_pace")}
            <br />
            {uiText("webHomeLanding:one_step_at_a_time")}
          </h3>
          <p className="mt-5 max-w-sm text-base leading-7 text-foreground-muted">
            {uiText(
              "webHomeLanding:browse_word_lists_practise_daily_and_earn_through_check_ins"
            )}
          </p>
          <Button asChild size="sm" className="mt-8 min-h-11 sm:min-h-10">
            <Link href="/wordlists">
              {uiText("webHomeLanding:choose_word_lists")}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </article>
        <article className="flex flex-col items-start rounded-3xl bg-muted p-8 sm:p-10">
          <p className="text-sm font-medium text-foreground-muted">
            {uiText("webHomeLanding:for_teachers")}
          </p>
          <h3 className="mt-4 text-3xl font-semibold tracking-tight">
            {uiText("webHomeLanding:plan_your_teaching")}
            <br />
            {uiText("webHomeLanding:with_a_clear_view_of_progress")}
          </h3>
          <p className="mt-5 max-w-sm text-base leading-7 text-foreground-muted">
            {uiText(
              "webHomeLanding:organise_and_share_word_lists_and_apply_for_teacher_certification_classe"
            )}
          </p>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="mt-8 min-h-11 sm:min-h-10"
          >
            <Link href="/apply-teacher">
              {uiText("webHomeLanding:apply_to_teach")}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </article>
      </div>
    </section>
  );
}

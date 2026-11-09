"use client";

import { localText } from "@/i18n/catalog";

import { useWebText } from "@/i18n/client";
import { webAuthAccess as webAuth } from "@/i18n/messages/auth/access";
import type { ReactNode } from "react";

const HIGHLIGHTS: {
  title: import("@/i18n/catalog").LocalText;
  desc: import("@/i18n/catalog").LocalText;
  icon: ReactNode;
}[] = [
  {
    title: localText(
      webAuth,
      "webAuthAccess:review_using_the_forgetting_curve"
    ),
    desc: localText(
      webAuth,
      "webAuthAccess:words_return_just_before_you_are_likely_to_forget_them_helping_you_remem"
    ),
    icon: <path d="M3 17c3-8 6-11 9-11s4 4 9 4M3 21h18" strokeLinecap="round" />
  },
  {
    title: localText(webAuth, "webAuthAccess:set_a_goal_and_follow_your_plan"),
    desc: localText(
      webAuth,
      "webAuthAccess:choose_word_lists_create_daily_or_long_term_tasks_and_track_your_practic"
    ),
    icon: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="m8.5 12 2.5 2.5 4.5-5" strokeLinecap="round" />
      </>
    )
  },
  {
    title: localText(webAuth, "webAuthAccess:earn_rewards_for_consistency"),
    desc: localText(
      webAuth,
      "webAuthAccess:earn_through_practice_and_check_ins"
    ),
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v8M9.5 10.5h5" strokeLinecap="round" />
      </>
    )
  }
];

// 认证页桌面左栏：大标题 + 要点卡片；小屏隐藏，让表单独占屏幕。
export function AuthBranding() {
  const uiText = useWebText(webAuth);
  return (
    <section className="animate-in hidden lg:block">
      <h2 className="text-[40px] font-bold leading-tight tracking-tight text-foreground">
        {uiText("webAuthAccess:remember_what")}
        <br />
        {uiText("webAuthAccess:you_have_learnt")}
      </h2>
      <p className="mt-3 text-sm font-medium tracking-[0.2em] text-foreground-muted">
        {uiText(
          "webAuthAccess:memory_based_learning_for_students_and_teachers"
        )}
      </p>
      <ul className="mt-12 max-w-md space-y-3">
        {HIGHLIGHTS.map((item) => (
          <li
            key={item.title.key}
            className="flex items-start gap-4 rounded-2xl border border-border/60 bg-muted/70 p-5 backdrop-blur-sm"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-surface text-primary shadow-sm">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
                className="size-[18px]"
                aria-hidden
              >
                {item.icon}
              </svg>
            </span>
            <div className="pt-0.5">
              <p className="text-sm font-semibold text-foreground">
                {uiText(item.title)}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-foreground-muted">
                {uiText(item.desc)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

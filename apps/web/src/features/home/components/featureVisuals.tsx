"use client";

import { localText, originalText } from "@/i18n/catalog";
import { useWebText } from "@/i18n/client";
import { webHomeLanding as webHome } from "@/i18n/messages/home/landing";
import styles from "./home.module.css";

// 曲线是机制示意，不代表用户数据或量化学习效果。
export function MemoryVisual() {
  const uiText = useWebText(webHome);
  return (
    <div>
      <div className="flex justify-between text-xs text-foreground-muted">
        <span>{uiText("webHomeLanding:memory_strength")}</span>
        <span>{uiText("webHomeLanding:review_schedule_illustration")}</span>
      </div>
      <svg
        viewBox="0 0 360 140"
        className="mt-4 w-full text-primary"
        role="img"
        aria-label={uiText(
          "webHomeLanding:illustrative_curve_showing_memory_strength_recovering_after_each_review"
        )}
      >
        <path
          d="M8 116H352 M8 70H352 M8 24H352"
          fill="none"
          stroke="currentColor"
          className="text-border"
          strokeDasharray="3 6"
        />
        <path
          className={styles.memoryLine}
          pathLength={1}
          d="M8 30C40 74 70 105 104 110L104 32C148 66 182 85 222 91L222 30C266 53 310 64 352 68"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="104" cy="32" r="5" fill="currentColor" />
        <circle cx="222" cy="30" r="5" fill="currentColor" />
      </svg>
      <div className="mt-3 flex justify-between text-xs text-foreground-muted">
        <span>{uiText("webHomeLanding:start_learning")}</span>
        <span>{uiText("webHomeLanding:review_again")}</span>
        <span>{uiText("webHomeLanding:keep_consolidating")}</span>
      </div>
    </div>
  );
}

export function WordbankVisual() {
  const uiText = useWebText(webHome);
  const rows = [
    { word: "abandon", definition: "vt. 放弃", tag: originalText("CET-4") },
    {
      word: "benefit",
      definition: "n. 益处",
      tag: localText(webHome, "webHomeLanding:postgraduate_entrance")
    },
    {
      word: "via",
      definition: "prep. 经由",
      tag: localText(webHome, "webHomeLanding:senior_secondary")
    }
  ];
  return (
    <ul
      className="divide-y divide-border/60"
      aria-label={uiText("webHomeLanding:example_word_list")}
    >
      {rows.map(({ word, definition, tag }) => (
        <li
          key={word}
          className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="tsz-words font-semibold text-foreground" lang="en">
              {word}
            </span>
            <span className="text-sm text-foreground-muted">{definition}</span>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-foreground-muted">
            {uiText(tag)}
          </span>
        </li>
      ))}
    </ul>
  );
}

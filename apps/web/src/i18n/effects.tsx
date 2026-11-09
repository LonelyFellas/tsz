"use client";

import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { interfacePreferences } from "@/lib/interface-preferences";
import { useUserStore } from "@/stores/user";
import { site } from "@/lib/site";
import { useWebLocale, useWebText } from "./client";
import { useWebLocaleReady } from "./boot";
import { webApp } from "./messages/app";
import { GUEST_LOCALE_COOKIE, openGraphLocale } from "./snapshot";

const titles: [RegExp, import("./types").WebStaticKey<typeof webApp>][] = [
  [/^\/login$/, "webApp:sign_in"],
  [/^\/register$/, "webApp:create_account"],
  [/^\/forgot-password$/, "webApp:reset_password"],
  [/^\/student\/home$/, "webApp:learning_home"],
  [/^\/bind-phone$/, "webApp:bind_phone_number"],
  [/^\/apply-teacher$/, "webApp:apply_to_teach"],
  [/^\/dictionary$/, "webApp:dictionary"],
  [/^\/dictionary\/[^/]+$/, "webApp:entry_details"],
  [/^\/wordlists$/, "webApp:word_lists"],
  [/^\/wordlists\/new$/, "webApp:my_word_lists"],
  [/^\/account$/, "webApp:account"],
  [/^\/account\/invitations$/, "webApp:invite_friends"],
  [/^\/account\/notifications$/, "webApp:notifications"],
  [/^\/account\/security$/, "webApp:account_security"],
  [
    /^\/account\/teacher-applications\/[^/]+$/,
    "webApp:teacher_application_details"
  ],
  [/^\/account\/wordlist-tips$/, "webApp:word_list_tips"],
  [/^\/account\/coins$/, "webApp:my_coins"],
  [/^\/account\/wordlists(?:\/.*)?$/, "webApp:my_word_lists"]
];
const descriptions: [RegExp, import("./types").WebStaticKey<typeof webApp>][] =
  [
    [
      /^\/login$/,
      "webApp:sign_in_to_and_continue_your_english_vocabulary_learning_plan"
    ],
    [
      /^\/register$/,
      "webApp:create_a_free_account_and_learn_english_vocabulary_using_the_forgetting"
    ],
    [
      /^\/forgot-password$/,
      "webApp:reset_your_password_using_a_verification_code"
    ],
    [
      /^\/apply-teacher$/,
      "webApp:submit_teacher_certification_documents_on_and_check_the_review_result_in"
    ],
    [
      /^\/wordlists$/,
      "webApp:browse_english_word_lists_on_grouped_by_textbook_and_topic"
    ]
  ];

export function WebLocaleEffects() {
  const locale = useWebLocale();
  const ready = useWebLocaleReady();
  const uiText = useWebText(webApp);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hydrated = useUserStore((state) => state.hydrated);
  const snapshot = useSyncExternalStore(
    interfacePreferences.subscribe,
    interfacePreferences.getSnapshot,
    interfacePreferences.getServerSnapshot
  );
  useLayoutEffect(() => {
    if (ready) {
      document.documentElement.lang = locale;
      document.documentElement.setAttribute("data-interface-locale-ready", "");
    } else
      document.documentElement.removeAttribute("data-interface-locale-ready");
    if (ready) {
      const url = new URL(window.location.href);
      if (url.searchParams.get("lang") !== locale) {
        url.searchParams.set("lang", locale);
        window.history.replaceState(window.history.state, "", url);
      }
    }
    const pageTitle = titles.find(([pattern]) => pattern.test(pathname))?.[1];
    const title = !ready
      ? site.name
      : pageTitle
        ? `${uiText(pageTitle)} | ${site.name}`
        : uiText("webApp:english_vocabulary_learning");
    const description = uiText(
      descriptions.find(([pattern]) => pattern.test(pathname))?.[1] ??
        "webApp:helps_students_and_teachers_learn_english_vocabulary_with_reviews_based"
    );
    const sync = () => {
      // 未读角标由原组件维护；写入无角标标题后让它更新自己的基准。
      if (document.title.replace(/^\(\d+\)\s*/, "") !== title)
        document.title = title;
      if (!ready) return;
      document.head
        .querySelector('link[rel="manifest"]')
        ?.setAttribute("href", `/manifest/${locale}`);
      for (const [selector, content] of [
        ['meta[name="description"]', description],
        [
          'meta[property="og:title"]',
          uiText("webApp:english_vocabulary_learning")
        ],
        [
          'meta[property="og:description"]',
          uiText(
            "webApp:helps_students_and_teachers_learn_english_vocabulary_with_reviews_based"
          )
        ],
        ['meta[property="og:locale"]', openGraphLocale[locale]],
        ['meta[property="og:image"]', `${site.url}/share-image/${locale}`],
        [
          'meta[property="og:image:alt"]',
          uiText("webApp:english_vocabulary_learning")
        ],
        ['meta[name="twitter:image"]', `${site.url}/share-image/${locale}`],
        [
          'meta[name="twitter:image:alt"]',
          uiText("webApp:english_vocabulary_learning")
        ],
        [
          'meta[name="twitter:title"]',
          uiText("webApp:english_vocabulary_learning")
        ],
        [
          'meta[name="twitter:description"]',
          uiText(
            "webApp:helps_students_and_teachers_learn_english_vocabulary_with_reviews_based"
          )
        ]
      ] as [string, string][])
        document.head.querySelector(selector)?.setAttribute("content", content);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true
    });
    return () => observer.disconnect();
  }, [locale, pathname, ready, searchParams, uiText]);
  useEffect(() => {
    if (
      !hydrated ||
      interfacePreferences.accountId() ||
      snapshot.owner !== interfacePreferences.sessionKey() ||
      snapshot.status !== "ready"
    )
      return;
    const locale = snapshot.preference;
    document.cookie = `${GUEST_LOCALE_COOKIE}=${locale ?? ""}; Path=/; SameSite=Lax; Max-Age=${locale ? 31536000 : 0}${location.protocol === "https:" ? "; Secure" : ""}`;
  }, [hydrated, snapshot]);
  useEffect(() => {
    const refresh = () => {
      void interfacePreferences.refresh();
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  return null;
}

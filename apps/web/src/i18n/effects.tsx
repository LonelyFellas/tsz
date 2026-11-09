"use client";

import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { interfacePreferences } from "@/lib/interface-preferences";
import { useUserStore } from "@/stores/user";
import { site } from "@/lib/site";
import { useWebLocale, useWebText } from "./client";
import { useWebLocaleReady } from "./boot";
import { webApp } from "./messages/app";
import { GUEST_LOCALE_COOKIE, openGraphLocale } from "./snapshot";

const titles: [RegExp, string][] = [
  [/^\/login$/, "登录"],
  [/^\/register$/, "注册"],
  [/^\/forgot-password$/, "找回密码"],
  [/^\/student\/home$/, "学习首页"],
  [/^\/bind-phone$/, "绑定手机号"],
  [/^\/apply-teacher$/, "申请成为老师"],
  [/^\/dictionary$/, "词典"],
  [/^\/dictionary\/[^/]+$/, "词条详情"],
  [/^\/wordlists$/, "单词表"],
  [/^\/wordlists\/new$/, "我的词表"],
  [/^\/account$/, "个人中心"],
  [/^\/account\/invitations$/, "邀请好友"],
  [/^\/account\/notifications$/, "站内通知"],
  [/^\/account\/security$/, "账号安全"],
  [/^\/account\/teacher-applications\/[^/]+$/, "教师认证申请详情"],
  [/^\/account\/wordlist-tips$/, "词表投币记录"],
  [/^\/account\/coins$/, "我的天生币"],
  [/^\/account\/wordlists(?:\/.*)?$/, "我的词表"]
];
const descriptions: [RegExp, string][] = [
  [/^\/login$/, "登录天生会背,继续你的英语单词学习计划。"],
  [/^\/register$/, "免费注册天生会背,按遗忘曲线科学背单词,开启高效英语学习。"],
  [/^\/forgot-password$/, "通过手机号验证码重置天生会背账号密码。"],
  [
    /^\/apply-teacher$/,
    "在天生会背提交教师认证资料，通过站内通知查看审核结果。"
  ],
  [
    /^\/wordlists$/,
    "浏览天生会背的英语单词表,按教材与主题分组,科学记忆每一个词。"
  ]
];

export function WebLocaleEffects() {
  const locale = useWebLocale();
  const ready = useWebLocaleReady();
  const uiText = useWebText(webApp);
  const pathname = usePathname();
  const hydrated = useUserStore((state) => state.hydrated);
  const snapshot = useSyncExternalStore(
    interfacePreferences.subscribe,
    interfacePreferences.getSnapshot,
    interfacePreferences.getServerSnapshot
  );
  useLayoutEffect(() => {
    if (!ready) return;
    document.documentElement.lang = locale;
    const pageTitle = titles.find(([pattern]) => pattern.test(pathname))?.[1];
    const title = pageTitle
      ? `${uiText(pageTitle)} | ${site.name}`
      : uiText(site.fullName);
    const description = uiText(
      descriptions.find(([pattern]) => pattern.test(pathname))?.[1] ??
        site.description
    );
    const sync = () => {
      // 未读角标由原组件维护；写入无角标标题后让它更新自己的基准。
      if (document.title.replace(/^\(\d+\)\s*/, "") !== title)
        document.title = title;
      for (const [selector, content] of [
        ['meta[name="description"]', description],
        ['meta[property="og:title"]', uiText(site.fullName)],
        ['meta[property="og:description"]', uiText(site.description)],
        ['meta[property="og:locale"]', openGraphLocale[locale]],
        ['meta[name="twitter:title"]', uiText(site.fullName)],
        ['meta[name="twitter:description"]', uiText(site.description)]
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
  }, [locale, pathname, ready, uiText]);
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

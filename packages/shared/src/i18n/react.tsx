"use client";

import {
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode
} from "react";
import type { InterfacePreferences } from "./preferences";
import { I18nextProvider } from "react-i18next";
import {
  createInterfaceI18n,
  DEFAULT_INTERFACE_LOCALE,
  type InterfaceLocale
} from "./index";

export { useTranslation } from "react-i18next";

export function InterfaceI18nProvider({
  children,
  locale = DEFAULT_INTERFACE_LOCALE
}: {
  children: ReactNode;
  locale?: InterfaceLocale;
}) {
  const instance = useMemo(() => createInterfaceI18n(locale), [locale]);
  // 显式绑定实例，不安装会修改 react-i18next 全局实例的 initReactI18next 插件。
  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}

/** 不等待目录/偏好来阻塞页面或鉴权；切换身份的首帧也不使用旧账号语言。 */
export function InterfacePreferencesProvider({
  controller,
  sessionKey,
  children
}: {
  controller: InterfacePreferences;
  sessionKey: string;
  children: ReactNode;
}) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot
  );
  useEffect(() => {
    void controller.refresh();
  }, [controller, sessionKey]);
  const locale =
    snapshot.owner === sessionKey ? snapshot.locale : DEFAULT_INTERFACE_LOCALE;
  return (
    <InterfaceI18nProvider locale={locale}>{children}</InterfaceI18nProvider>
  );
}

"use client";

import {
  useEffect,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode
} from "react";
import type { InterfacePreferences } from "./preferences";
import {
  I18nextProvider,
  I18nContext,
  useTranslation as useReactTranslation
} from "react-i18next";
import {
  createInterfaceI18n,
  DEFAULT_INTERFACE_LOCALE,
  type InterfaceLocale
} from "./index";
import type { InterfaceResourceBundles } from "./index";

export { useTranslation } from "react-i18next";

/** 单独使用控件时保持默认中文；缺少 Provider 时也不共享可变实例。 */
export function useInterfaceInstance(
  factory: () => ReturnType<typeof createInterfaceI18n> = createInterfaceI18n
) {
  const provided = useContext(I18nContext)?.i18n;
  return useMemo(() => provided ?? factory(), [provided, factory]);
}

export function useInterfaceTranslation() {
  return useReactTranslation("common", { i18n: useInterfaceInstance() });
}

export function InterfaceI18nProvider({
  children,
  locale = DEFAULT_INTERFACE_LOCALE,
  resources
}: {
  children: ReactNode;
  locale?: InterfaceLocale;
  resources?: InterfaceResourceBundles;
}) {
  const instance = useMemo(
    () => createInterfaceI18n(locale, resources),
    [locale, resources]
  );
  // 显式绑定实例，不安装会修改 react-i18next 全局实例的 initReactI18next 插件。
  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}

/** 不等待目录/偏好来阻塞页面或鉴权；切换身份的首帧也不使用旧账号语言。 */
export function InterfacePreferencesProvider({
  controller,
  sessionKey,
  resources,
  children
}: {
  controller: InterfacePreferences;
  sessionKey: string;
  resources?: InterfaceResourceBundles;
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
    <InterfaceI18nProvider locale={locale} resources={resources}>
      {children}
    </InterfaceI18nProvider>
  );
}

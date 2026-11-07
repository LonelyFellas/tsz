"use client";

import { useMemo, type ReactNode } from "react";
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

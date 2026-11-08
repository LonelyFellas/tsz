import { useMemo } from "react";
import {
  createInterfaceI18n,
  type InterfaceLocale,
  type InterfaceNamespaces,
  type InterfaceResourceBundles
} from "@tsz/shared/i18n";
import { useInterfaceInstance, useTranslation } from "@tsz/shared/i18n/react";
import { adminShellResources, type AdminShellKey } from "./resources";

export { adminShellResources } from "./resources";
export function createAdminI18n(locale?: InterfaceLocale) {
  return createInterfaceI18n(locale, adminShellResources);
}
export function useAdminTranslation() {
  return useTranslation("adminShell", {
    i18n: useInterfaceInstance(createAdminI18n)
  });
}

/** 路由随自身代码加载资源，不把全部后台文案装入登录首包。 */
export function useAdminModuleTranslation<N extends keyof InterfaceNamespaces>(
  namespace: N,
  resources: InterfaceResourceBundles
) {
  const instance = useInterfaceInstance(createAdminI18n);
  useMemo(() => {
    for (const [language, namespaces] of Object.entries(resources)) {
      if (!instance.hasResourceBundle(language, namespace))
        instance.addResourceBundle(language, namespace, namespaces[namespace]);
    }
  }, [instance, namespace, resources]);
  return useTranslation(namespace, { i18n: instance });
}
export function AdminText({
  message,
  params
}: {
  message: AdminShellKey;
  params?: Record<string, string | number>;
}) {
  const { t } = useAdminTranslation();
  return <>{t(message, params ?? {})}</>;
}

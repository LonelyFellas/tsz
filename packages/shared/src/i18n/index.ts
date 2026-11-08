import { createInstance, type i18n, type Resource } from "i18next";
import { resolveInterfaceLocale } from "./locale";
import { interfaceResources } from "./resources";

/** 各应用通过模块扩展登记自己的命名空间，资源仍由应用按需装配。 */
export interface InterfaceNamespaces {
  common: (typeof interfaceResources)["en"]["common"];
}
export type InterfaceResourceBundles = Resource;

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: InterfaceNamespaces;
    strictKeyChecks: true;
    returnNull: false;
  }
}

export {
  DEFAULT_INTERFACE_LOCALE,
  INTERFACE_LOCALES,
  normalizeInterfaceLocale,
  resolveInterfaceLocale,
  type InterfaceLocale
} from "./locale";
export { formatInterfaceDateTime, formatInterfaceNumber } from "./format";

/** 每次调用独立创建；服务端不得把实例提升为模块单例。 */
export function createInterfaceI18n(
  locale?: unknown,
  additionalResources?: InterfaceResourceBundles
): i18n {
  const instance = createInstance();
  const resources: Resource = structuredClone(interfaceResources);
  for (const [language, namespaces] of Object.entries(
    additionalResources ?? {}
  )) {
    resources[language] = {
      ...resources[language],
      ...structuredClone(namespaces)
    };
  }
  // 仅加载随包资源，关闭异步初始化，保证 SSR 与客户端第一次渲染一致。
  void instance.init({
    lng: resolveInterfaceLocale(locale),
    resources,
    supportedLngs: Object.keys(interfaceResources),
    load: "currentOnly",
    fallbackLng: {
      "en-GB": ["en", "zh-Hans"],
      "en-US": ["en", "zh-Hans"],
      default: ["zh-Hans"]
    },
    ns: Object.keys(resources["zh-Hans"] ?? {}),
    defaultNS: "common",
    initAsync: false,
    returnNull: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false }
  });
  return instance;
}

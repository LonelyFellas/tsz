import { createInstance, type i18n } from "i18next";
import { resolveInterfaceLocale } from "./locale";
import { interfaceResources } from "./resources";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: (typeof interfaceResources)["en"];
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
export function createInterfaceI18n(locale?: unknown): i18n {
  const instance = createInstance();
  // 仅加载随包资源，关闭异步初始化，保证 SSR 与客户端第一次渲染一致。
  void instance.init({
    lng: resolveInterfaceLocale(locale),
    resources: structuredClone(interfaceResources),
    supportedLngs: Object.keys(interfaceResources),
    load: "currentOnly",
    fallbackLng: {
      "en-GB": ["en", "zh-Hans"],
      "en-US": ["en", "zh-Hans"],
      default: ["zh-Hans"]
    },
    ns: ["common"],
    defaultNS: "common",
    initAsync: false,
    returnNull: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false }
  });
  return instance;
}

/** 已内置资源的界面语言；是否向用户开放由后续业务能力目录决定。 */
export const INTERFACE_LOCALES = [
  "zh-Hans",
  "zh-Hant",
  "en-GB",
  "en-US"
] as const;

export type InterfaceLocale = (typeof INTERFACE_LOCALES)[number];

export const DEFAULT_INTERFACE_LOCALE: InterfaceLocale = "zh-Hans";

/** 仅用于界面语言匹配，不用于内容语言、语音 locale 或 API 写入校验。 */
export function normalizeInterfaceLocale(
  value: unknown
): InterfaceLocale | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const { language, script, region } = new Intl.Locale(value);
    if (language === "zh") {
      if (script === "Hans") return "zh-Hans";
      if (script === "Hant") return "zh-Hant";
      if (script) return undefined;
      return region && ["TW", "HK", "MO"].includes(region)
        ? "zh-Hant"
        : "zh-Hans";
    }
    if (language === "en" && (!script || script === "Latn")) {
      return region === "US" ? "en-US" : "en-GB";
    }
  } catch {
    // 无效 BCP 47 标签继续尝试下一候选，不读取浏览器或账号状态。
  }
  return undefined;
}

/** 调用方按优先级提供候选；没有有效候选时保持默认中文。 */
export function resolveInterfaceLocale(
  ...candidates: unknown[]
): InterfaceLocale {
  for (const candidate of candidates) {
    const locale = normalizeInterfaceLocale(candidate);
    if (locale) return locale;
  }
  return DEFAULT_INTERFACE_LOCALE;
}

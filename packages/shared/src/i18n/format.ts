import { DEFAULT_INTERFACE_LOCALE, type InterfaceLocale } from "./locale";

export function formatInterfaceNumber(
  value: number | bigint,
  locale: InterfaceLocale = DEFAULT_INTERFACE_LOCALE,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/** 显式传时区，避免服务器与浏览器默认时区不同；语言切换不推导时区。 */
export function formatInterfaceDateTime(
  value: Date | number,
  locale: InterfaceLocale,
  options: Intl.DateTimeFormatOptions & { timeZone: string }
): string {
  return new Intl.DateTimeFormat(locale, options).format(value);
}

export type SpeechAccentGroup = "uk" | "us" | "other";

export function speechAccentGroup(
  locale: string | undefined,
  accent?: "gb" | "us" | "none"
): SpeechAccentGroup | undefined {
  if (accent) return accent === "gb" ? "uk" : accent === "us" ? "us" : "other";
  if (!locale || !/^en-[A-Z]{2}$/.test(locale)) return undefined;
  if (["en-GB", "en-AU", "en-NZ"].includes(locale)) return "uk";
  if (["en-US", "en-CA"].includes(locale)) return "us";
  return "other";
}

export function speechSelectionGroup(
  locale: string | undefined,
  accent?: "gb" | "us" | "none"
): string | undefined {
  const group = speechAccentGroup(locale, accent);
  return group === "other" ? locale : group;
}

export function speechRegionLabel(
  locale: string,
  interfaceLocale = "zh-Hans"
): string {
  const regions = new Intl.DisplayNames([interfaceLocale], { type: "region" });
  return /^en-[A-Z]{2}$/.test(locale)
    ? (regions.of(locale.slice(3)) ?? locale)
    : locale;
}

export function speechLocaleMatchesScope(
  voiceLocale: string,
  scope?: string,
  accent?: "gb" | "us" | "none"
): boolean {
  if (!scope) return !!speechAccentGroup(voiceLocale, accent);
  const group = speechAccentGroup(voiceLocale, accent);
  return group === "other" || group === speechAccentGroup(scope);
}

export type SpeechAccentGroup = "uk" | "us" | "other";

export function speechAccentGroup(
  locale: string | undefined
): SpeechAccentGroup | undefined {
  if (!locale || !/^en-[A-Z]{2}$/.test(locale)) return undefined;
  if (["en-GB", "en-AU", "en-NZ"].includes(locale)) return "uk";
  if (["en-US", "en-CA"].includes(locale)) return "us";
  return "other";
}

export function speechSelectionGroup(
  locale: string | undefined
): string | undefined {
  const group = speechAccentGroup(locale);
  return group === "other" ? locale : group;
}

const regions = new Intl.DisplayNames(["zh-CN"], { type: "region" });
export function speechRegionLabel(locale: string): string {
  return /^en-[A-Z]{2}$/.test(locale)
    ? (regions.of(locale.slice(3)) ?? locale)
    : locale;
}

export function speechLocaleMatchesScope(
  voiceLocale: string,
  scope?: string
): boolean {
  if (!scope) return !!speechAccentGroup(voiceLocale);
  const group = speechAccentGroup(voiceLocale);
  return group === "other" || group === speechAccentGroup(scope);
}

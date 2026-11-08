import { expect, it } from "vitest";
import { INTERFACE_LOCALES } from "@tsz/shared/i18n";
import { speechDiagnostic, speechDiagnosticMessages } from "./diagnostics";

it("适配器本地诊断四语完整，保留官方格式、HTTP 状态及引用正文", () => {
  const placeholders = (value: string) =>
    [...value.matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort();
  for (const values of Object.values(speechDiagnosticMessages)) {
    for (const value of values) {
      expect(value.trim()).not.toBe("");
      expect(placeholders(value)).toEqual(placeholders(values[0]));
    }
  }
  for (const locale of INTERFACE_LOCALES) {
    expect(
      speechDiagnostic("upload_put_http", { status: 403 })(locale)
    ).toContain("403");
    expect(
      speechDiagnostic("reading_stale", { surface: "原文 en-US <entry>" })(
        locale
      )
    ).toContain("原文 en-US <entry>");
    expect(
      speechDiagnostic("upload_type", { formats: "MP3 / WAV" })(locale)
    ).toContain("MP3 / WAV");
    if (locale.startsWith("en"))
      expect(speechDiagnostic("preview_voice")(locale)).toContain(
        "selected voice"
      );
  }
});

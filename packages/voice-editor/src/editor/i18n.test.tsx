import { createInterfaceI18n, INTERFACE_LOCALES } from "@tsz/shared/i18n";
import { expect, it } from "vitest";
import { voiceEditorResources, voiceEditorErrorMessage } from "./i18n";
import { voiceEditorMessages } from "./messages";

it("共享编辑器四语资源的键、插值与非空译文完整，独立实例仍不预载编辑资源", () => {
  const keys = Object.keys(voiceEditorMessages).sort();
  for (const key of keys.filter((key) => key.endsWith("_other"))) {
    expect(
      Object.hasOwn(
        voiceEditorResources.en.voiceEditor,
        key.replace(/_other$/, "_one")
      ),
      key
    ).toBe(true);
  }

  const placeholders = (text: string) =>
    [...text.matchAll(/{{\s*(\w+)(?:,[^}]*)?}}/g)]
      .map((match) => match[1])
      .sort();
  for (const bundle of Object.values(voiceEditorResources)) {
    expect(Object.keys(bundle.voiceEditor).sort()).toEqual(keys);
    for (const [key, value] of Object.entries(bundle.voiceEditor)) {
      expect(value.trim(), key).not.toBe("");
      expect(placeholders(value), key).toEqual(
        placeholders(
          voiceEditorResources["zh-Hans"].voiceEditor[
            key as keyof typeof voiceEditorMessages
          ]
        )
      );
    }
  }
  for (const locale of INTERFACE_LOCALES) {
    const instance = createInterfaceI18n(locale, voiceEditorResources);
    expect(instance.t("voice_editor", { ns: "voiceEditor" })).toBe(
      locale.startsWith("en")
        ? "Voice editor"
        : locale === "zh-Hant"
          ? "語音編輯器"
          : "语音编辑器"
    );
  }
  expect(
    createInterfaceI18n("en-US").hasResourceBundle("en", "voiceEditor")
  ).toBe(false);
});

it("英文停顿时长使用正确的单复数", () => {
  const instance = createInterfaceI18n("en-US", voiceEditorResources);
  expect(
    instance.t("pause_duration_seconds", { ns: "voiceEditor", count: 1 })
  ).toBe("Pause 1 second");
  expect(
    instance.t("pause_duration_seconds", { ns: "voiceEditor", count: 2 })
  ).toBe("Pause 2 seconds");
  expect(instance.t("seconds_value", { ns: "voiceEditor", count: 0.5 })).toBe(
    "0.5 seconds"
  );
});

it("未知提供方错误保留原文，不进入本地诊断翻译", () => {
  const cause = new Error("provider raw detail 001 / en-GB");
  expect(voiceEditorErrorMessage(cause, "generation_failed_try_again")).toBe(
    cause.message
  );
});

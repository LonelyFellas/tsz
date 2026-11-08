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

it("适配器已显示错误随界面语言更新，错误码与重试属性保留且不重复请求", async () => {
  const { render, screen, fireEvent, waitFor } =
    await import("@testing-library/react");
  const { InterfaceI18nProvider } = await import("@tsz/shared/i18n/react");
  const { useVoiceEditorMessageState } = await import("./i18n");
  const { VoicePreviewError, AudioUploadError } = await import("../types");
  const { describeUploadError } = await import("./next/audioAssets");
  let calls = 0;
  const failure = new VoicePreviewError(
    "unavailable",
    (locale) => `${locale ?? "zh-Hans"}: unavailable`,
    true
  );
  const upload = new AudioUploadError(
    "confirm_failed",
    (locale) => `${locale}: confirm`,
    true
  );
  const pending = describeUploadError(upload);
  function Probe() {
    const [error, setError] = useVoiceEditorMessageState();
    return (
      <>
        <button
          onClick={() => {
            calls += 1;
            setError(failure);
          }}
        >
          request
        </button>
        <output>{error}</output>
      </>
    );
  }
  const view = render(
    <InterfaceI18nProvider locale="zh-Hans">
      <Probe />
    </InterfaceI18nProvider>
  );
  fireEvent.click(screen.getByText("request"));
  expect(screen.getByText("zh-Hans: unavailable")).toBeTruthy();
  for (const locale of INTERFACE_LOCALES) {
    view.rerender(
      <InterfaceI18nProvider locale={locale}>
        <Probe />
      </InterfaceI18nProvider>
    );
    await waitFor(() =>
      expect(screen.getByText(`${locale}: unavailable`)).toBeTruthy()
    );
    expect(pending.displayMessage?.(locale)).toBe(`${locale}: confirm`);
  }
  expect(calls).toBe(1);
  expect(failure).toMatchObject({ code: "unavailable", retryable: true });
  expect(pending.retryable).toBe(true);
  view.unmount();
});

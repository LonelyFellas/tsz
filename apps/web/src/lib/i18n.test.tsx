import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  InterfaceI18nProvider,
  InterfacePreferencesProvider,
  useTranslation
} from "@tsz/shared/i18n/react";
import { createInterfacePreferences } from "@tsz/shared/i18n/preferences";
import type { InterfaceLocale } from "@tsz/shared/i18n";

function SaveLabel() {
  const { t } = useTranslation();
  return <button>{t("actions.save")}</button>;
}

describe("界面翻译 Provider", () => {
  it("换号第一帧恢复默认语言，旧账号状态不闪入新账号", async () => {
    let accountId = "a";
    const controller = createInterfacePreferences({
      surface: "web",
      getSession: () => ({ accountId, generation: 1 }),
      capabilities: async () => ({
        schema_version: 1,
        preference_version: 1,
        default_locale: "zh-Hans",
        supported_locales: ["zh-Hans", "en-US"]
      }),
      read: async () => "en-US",
      write: async (value) => value
    });
    const tree = () => (
      <InterfacePreferencesProvider
        controller={controller}
        sessionKey={controller.sessionKey()}
      >
        <SaveLabel />
      </InterfacePreferencesProvider>
    );
    const view = render(tree());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument()
    );
    accountId = "b";
    view.rerender(tree());
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
  });
  it("在同一 React 树中隔离不同语言，更新 Provider 不影响其他实例", () => {
    const tree = (locale: InterfaceLocale) => (
      <>
        <InterfaceI18nProvider locale={locale}>
          <SaveLabel />
        </InterfaceI18nProvider>
        <InterfaceI18nProvider>
          <SaveLabel />
        </InterfaceI18nProvider>
      </>
    );
    const view = render(tree("en-US"));
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    view.rerender(tree("zh-Hant"));
    expect(screen.getByRole("button", { name: "儲存" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
  });

  it.each([undefined, "en-US"] as const)(
    "%s 首屏 SSR 与水合一致",
    async (locale) => {
      const tree = (
        <InterfaceI18nProvider locale={locale}>
          <SaveLabel />
        </InterfaceI18nProvider>
      );
      const container = document.createElement("div");
      const onRecoverableError = vi.fn();
      container.innerHTML = renderToString(tree);
      const initial = container.innerHTML;
      expect(container.textContent).toBe(locale ? "Save" : "保存");
      const root = hydrateRoot(container, tree, { onRecoverableError });
      try {
        await act(async () => {});
        expect(container.innerHTML).toBe(initial);
        expect(onRecoverableError).not.toHaveBeenCalled();
      } finally {
        await act(async () => root.unmount());
      }
    }
  );

  it("通过 React 文本插值展示输入，不把输入解析为 HTML", () => {
    function PageLabel() {
      const { t } = useTranslation();
      return <span>{t("pagination.page", { page: '<img src="x">' })}</span>;
    }
    const html = renderToString(
      <InterfaceI18nProvider locale="en-GB">
        <PageLabel />
      </InterfaceI18nProvider>
    );
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
  });
});

it("首屏提示在目录恢复期间保持，恢复另一账号时不沿用访客提示", async () => {
  let accountId: string | null = null;
  let resolveDirectory!: (value: {
    schema_version: 1;
    preference_version: 1;
    default_locale: "zh-Hans";
    supported_locales: ("zh-Hans" | "en-GB")[];
  }) => void;
  const directory = new Promise<{
    schema_version: 1;
    preference_version: 1;
    default_locale: "zh-Hans";
    supported_locales: ("zh-Hans" | "en-GB")[];
  }>((resolve) => {
    resolveDirectory = resolve;
  });
  const controller = createInterfacePreferences({
    surface: "web",
    getSession: () => ({ accountId, generation: 1 }),
    capabilities: () => directory,
    read: () => new Promise(() => {}),
    write: async (value) => value,
    getStorage: () => ({
      getItem: (key) => (key.endsWith(":guest") ? "en-GB" : null),
      setItem: () => {},
      removeItem: () => {}
    })
  });
  const tree = () => (
    <InterfacePreferencesProvider
      controller={controller}
      sessionKey={controller.sessionKey()}
      initialLocale="en-GB"
    >
      <SaveLabel />
    </InterfacePreferencesProvider>
  );
  const view = render(tree());
  expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  expect(controller.getSnapshot().refreshing).toBe(true);
  await act(async () =>
    resolveDirectory({
      schema_version: 1,
      preference_version: 1,
      default_locale: "zh-Hans",
      supported_locales: ["zh-Hans", "en-GB"]
    })
  );
  expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  accountId = "account-b";
  view.rerender(tree());
  expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
});

it("目录失败保留已确认语言，重试目录收缩后才回退", async () => {
  const supported = {
    schema_version: 1 as const,
    preference_version: 1 as const,
    default_locale: "zh-Hans" as const,
    supported_locales: ["zh-Hans", "en-US"] as ("zh-Hans" | "en-US")[]
  };
  const capabilities = vi.fn(async () => supported);
  const controller = createInterfacePreferences({
    surface: "web",
    getSession: () => ({ accountId: null, generation: 1 }),
    capabilities,
    read: async () => null,
    write: async (value) => value,
    getStorage: () => ({
      getItem: () => "en-US",
      setItem: () => {},
      removeItem: () => {}
    })
  });
  render(
    <InterfacePreferencesProvider
      controller={controller}
      sessionKey={controller.sessionKey()}
      initialLocale="en-US"
    >
      <SaveLabel />
    </InterfacePreferencesProvider>
  );
  await waitFor(() => expect(controller.getSnapshot().status).toBe("ready"));
  capabilities.mockRejectedValueOnce(new Error("directory unavailable"));
  await act(async () => controller.refresh());
  expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  let resolveRetry!: (value: typeof supported) => void;
  capabilities.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveRetry = resolve;
      })
  );
  let retry!: Promise<void>;
  act(() => {
    retry = controller.refresh();
  });
  expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  await act(async () => {
    resolveRetry({ ...supported, supported_locales: ["zh-Hans"] });
    await retry;
  });
  expect(controller.getSnapshot().preference).toBe("en-US");
  expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
});

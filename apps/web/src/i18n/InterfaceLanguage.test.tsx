import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InterfacePreferencesProvider } from "@tsz/shared/i18n/react";
import {
  createInterfacePreferences,
  interfaceLocaleStorageKey
} from "@tsz/shared/i18n/preferences";
import type { InterfaceLocale } from "@tsz/shared/i18n";
import { RequestTimeoutError } from "@tsz/api-client";
import { InterfaceLanguage } from "./InterfaceLanguage";

function fixture({
  preference = null,
  supported = ["zh-Hans", "zh-Hant", "en-GB", "en-US"]
}: {
  preference?: InterfaceLocale | null;
  supported?: InterfaceLocale[];
} = {}) {
  let accountId: string | null = null;
  let saved = preference;
  const storage = new Map<string, string>();
  const write = vi.fn(async (locale: InterfaceLocale | null) => {
    saved = locale;
    return saved;
  });
  const read = vi.fn(async () => saved);
  const controller = createInterfacePreferences({
    surface: "web",
    getSession: () => ({ accountId, generation: 1 }),
    capabilities: async () => ({
      schema_version: 1,
      preference_version: 1,
      default_locale: "zh-Hans",
      supported_locales: supported
    }),
    read,
    write,
    getStorage: () => ({
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
      removeItem: (key) => {
        storage.delete(key);
      }
    })
  });
  const tree = () => (
    <InterfacePreferencesProvider
      controller={controller}
      sessionKey={controller.sessionKey()}
    >
      <InterfaceLanguage controller={controller} />
    </InterfacePreferencesProvider>
  );
  return {
    controller,
    tree,
    read,
    write,
    storage,
    login: () => {
      accountId = "account-a";
    }
  };
}

describe("Web 语言选择", () => {
  it("访客只保存独立本机选择；登录后读取账号偏好且不复制访客值", async () => {
    const f = fixture({ preference: "zh-Hant" });
    const view = render(f.tree());
    const select = await screen.findByRole("combobox", { name: "界面语言" });
    fireEvent.change(select, { target: { value: "en-US" } });
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Interface language" })
      ).toHaveValue("en-US")
    );
    expect(f.storage.get(interfaceLocaleStorageKey("web", "guest"))).toBe(
      "en-US"
    );
    expect(f.write).not.toHaveBeenCalled();
    expect(f.read).not.toHaveBeenCalled();
    f.login();
    view.rerender(f.tree());
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "介面語言" })).toHaveValue(
        "zh-Hant"
      )
    );
    expect(f.write).not.toHaveBeenCalled();
    expect(f.storage.has(interfaceLocaleStorageKey("web", "account-a"))).toBe(
      false
    );
  });

  it("保存结果未知时独立回读，确认已持久化才保留新选择", async () => {
    const f = fixture();
    f.login();
    f.write.mockImplementationOnce(async (locale) => {
      f.read.mockResolvedValue(locale);
      throw new RequestTimeoutError("PATCH");
    });
    render(f.tree());
    const select = await screen.findByRole("combobox", { name: "界面语言" });
    fireEvent.change(select, { target: { value: "en-GB" } });
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Interface language" })
      ).toHaveValue("en-GB")
    );
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(f.write).toHaveBeenCalledTimes(1);
  });

  it("目录收缩保留已保存值、显示回退且不自动写回", async () => {
    const f = fixture({ preference: "en-US", supported: ["zh-Hans"] });
    f.login();
    render(f.tree());
    const select = await screen.findByRole("combobox", { name: "界面语言" });
    expect(select).toHaveValue("en-US");
    expect(
      screen.getByRole("option", { name: /English \(US\)/ })
    ).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("当前显示简体中文");
    expect(f.controller.getSnapshot().preference).toBe("en-US");
    expect(f.write).not.toHaveBeenCalled();
  });
});

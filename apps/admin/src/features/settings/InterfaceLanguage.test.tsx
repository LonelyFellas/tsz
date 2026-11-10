import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createInterfacePreferences } from "@tsz/shared/i18n/preferences";
import { InterfacePreferencesProvider } from "@tsz/shared/i18n/react";
import type { InterfaceCapabilities } from "@tsz/types";
import { adminShellResources } from "@/i18n/resources";
import { InterfaceLanguage } from "./InterfaceLanguage";

it("紧凑菜单显示生效语言，访客选择与跟随浏览器只更新访客偏好", async () => {
  const storage = new Map<string, string>();
  const read = vi.fn();
  const write = vi.fn();
  const controller = createInterfacePreferences({
    surface: "admin",
    getSession: () => ({ accountId: null, generation: 1 }),
    capabilities: async () => ({
      schema_version: 1,
      preference_version: 1,
      default_locale: "zh-Hans",
      supported_locales: ["zh-Hans", "en-US"]
    }),
    read,
    write,
    browserLanguages: () => ["en-US"],
    getStorage: () => ({
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key)
    })
  });
  await controller.refresh();
  render(
    <InterfacePreferencesProvider
      controller={controller}
      sessionKey={controller.sessionKey()}
      resources={adminShellResources}
    >
      <InterfaceLanguage compact controller={controller} />
    </InterfacePreferencesProvider>
  );
  const trigger = screen.getByRole("button", {
    name: "Interface language: English (US)"
  });
  await waitFor(() => expect(trigger).toBeEnabled());
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const browser = await screen.findByRole("menuitem", {
    name: "Use browser language"
  });
  await waitFor(() => expect(browser).toHaveFocus());
  fireEvent.keyDown(browser, { key: "Escape" });
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(trigger);
  const chineseChoice = await screen.findByRole("menuitem", {
    name: "简体中文"
  });
  chineseChoice.focus();
  fireEvent.keyDown(chineseChoice, { key: "Enter", keyCode: 13 });
  const chinese = await screen.findByRole("button", {
    name: "界面语言: 简体中文"
  });
  await waitFor(() => expect(chinese).toHaveFocus());
  expect([...storage.values()]).toEqual(["zh-Hans"]);
  fireEvent.click(chinese);
  fireEvent.click(await screen.findByRole("menuitem", { name: "跟随浏览器" }));
  await screen.findByRole("button", {
    name: "Interface language: English (US)"
  });
  expect(controller.getSnapshot().preference).toBeNull();
  expect(storage.size).toBe(0);
  expect(read).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
});

it.each(["success", "failure", "focus-moved"] as const)(
  "紧凑菜单保存中禁用，%s 后恢复操作且尊重用户焦点",
  async (result) => {
    let preference: "en-US" | null = null;
    let resolveWrite!: (value: "en-US" | null) => void;
    let rejectWrite!: (error: Error) => void;
    const write = vi.fn(
      () =>
        new Promise<"en-US" | null>((resolve, reject) => {
          resolveWrite = resolve;
          rejectWrite = reject;
        })
    );
    const controller = createInterfacePreferences({
      surface: "admin",
      getSession: () => ({ accountId: "compact-fixture", generation: 1 }),
      capabilities: async () => ({
        schema_version: 1,
        preference_version: 1,
        default_locale: "zh-Hans",
        supported_locales: ["zh-Hans", "en-US"]
      }),
      read: async () => preference,
      write
    });
    await controller.refresh();
    render(
      <InterfacePreferencesProvider
        controller={controller}
        sessionKey={controller.sessionKey()}
        resources={adminShellResources}
      >
        <InterfaceLanguage compact controller={controller} />
        <button>其他操作</button>
      </InterfacePreferencesProvider>
    );
    const trigger = screen.getByRole("button", { name: "界面语言: 简体中文" });
    await waitFor(() => expect(trigger).toBeEnabled());
    fireEvent.click(trigger);
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "English (US)" })
    );
    await waitFor(() => expect(trigger).toBeDisabled());
    expect(write).toHaveBeenCalledExactlyOnceWith("en-US");
    const other = screen.getByRole("button", { name: "其他操作" });
    if (result === "focus-moved") other.focus();
    await act(async () => {
      if (result !== "failure") {
        preference = "en-US";
        resolveWrite(preference);
      } else rejectWrite(new Error("network"));
    });
    if (result === "failure")
      expect(await screen.findByRole("alert")).toHaveTextContent("保存失败");
    else expect(screen.queryByRole("alert")).toBeNull();
    expect(trigger).toBeEnabled();
    expect(trigger).toHaveTextContent(
      result !== "failure" ? "English (US)" : "简体中文"
    );
    await waitFor(() =>
      expect(result === "focus-moved" ? other : trigger).toHaveFocus()
    );
    fireEvent.click(trigger);
    expect(
      await screen.findByRole("menuitem", { name: "English (US)" })
    ).toBeVisible();
  }
);

it("选择器保存成功才切换，失败保留旧值，目录收缩保留停用偏好", async () => {
  let directory: InterfaceCapabilities = {
    schema_version: 1,
    preference_version: 1,
    default_locale: "zh-Hans",
    supported_locales: ["zh-Hans", "en-US"]
  };
  let preference: "en-US" | null = null;
  const write = vi.fn(async () => {
    preference = "en-US" as const;
    return preference;
  });
  const controller = createInterfacePreferences({
    surface: "admin",
    getSession: () => ({ accountId: "admin-fixture", generation: 1 }),
    capabilities: async () => directory,
    read: async () => preference,
    write
  });
  await controller.refresh();
  render(
    <InterfacePreferencesProvider
      controller={controller}
      sessionKey={controller.sessionKey()}
      resources={adminShellResources}
    >
      <InterfaceLanguage controller={controller} />
    </InterfacePreferencesProvider>
  );
  const select = () => screen.getByRole("combobox");
  await waitFor(() => expect(select()).not.toBeDisabled());
  fireEvent.keyDown(select(), { key: "ArrowDown", keyCode: 40 });
  fireEvent.click(await screen.findByText("English (US)"));
  await waitFor(() =>
    expect(screen.getByLabelText("Interface language")).toBeInTheDocument()
  );
  expect(write).toHaveBeenCalledExactlyOnceWith("en-US");
  write.mockRejectedValueOnce(new Error("network"));
  await waitFor(() => expect(select()).not.toBeDisabled());
  fireEvent.keyDown(select(), { key: "ArrowDown", keyCode: 40 });
  fireEvent.click(await screen.findByText("简体中文"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
  expect(controller.getSnapshot().preference).toBe("en-US");
  directory = { ...directory, supported_locales: ["zh-Hans"] };
  await act(() => controller.refresh());
  expect(screen.getByRole("status")).toHaveTextContent("所选语言暂不可用");
  expect(screen.getByText("English (US) (当前不可用)")).toBeInTheDocument();
  expect(controller.getSnapshot().preference).toBe("en-US");
  expect(write).toHaveBeenCalledTimes(2);
});

it("保存已提交但响应丢失时，控件主动回读后显示真实偏好", async () => {
  let preference: "en-US" | null = null;
  const write = vi.fn(async () => {
    preference = "en-US";
    throw new TypeError("response lost");
  });
  const read = vi.fn(async () => preference);
  const controller = createInterfacePreferences({
    surface: "admin",
    getSession: () => ({ accountId: "admin-fixture", generation: 1 }),
    capabilities: async () => ({
      schema_version: 1,
      preference_version: 1,
      default_locale: "zh-Hans",
      supported_locales: ["zh-Hans", "en-US"]
    }),
    read,
    write
  });
  await controller.refresh();
  render(
    <InterfacePreferencesProvider
      controller={controller}
      sessionKey={controller.sessionKey()}
      resources={adminShellResources}
    >
      <InterfaceLanguage controller={controller} />
    </InterfacePreferencesProvider>
  );
  const select = screen.getByRole("combobox");
  await waitFor(() => expect(select).not.toBeDisabled());
  const previousReads = read.mock.calls.length;
  fireEvent.keyDown(select, { key: "ArrowDown", keyCode: 40 });
  fireEvent.click(await screen.findByText("English (US)"));
  await screen.findByLabelText("Interface language");
  expect(read.mock.calls.length).toBeGreaterThan(previousReads);
  expect(controller.getSnapshot().preference).toBe("en-US");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(write).toHaveBeenCalledExactlyOnceWith("en-US");
});

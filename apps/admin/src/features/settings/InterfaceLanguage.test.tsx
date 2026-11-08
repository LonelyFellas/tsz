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

import { beforeEach, expect, it, vi } from "vitest";
import { interfaceLocaleStorageKey } from "@tsz/shared/i18n/preferences";
const mock = vi.hoisted(() => ({
  accountId: null as string | null,
  generation: 1,
  read: vi.fn(),
  write: vi.fn(),
  capabilities: vi.fn()
}));
vi.mock("./auth", () => ({
  authRuntime: {
    store: {
      getState: () => ({ user: mock.accountId ? { id: mock.accountId } : null })
    },
    tokens: { getSessionGeneration: () => mock.generation },
    api: {
      interfaceCapabilities: mock.capabilities,
      interfacePreferences: { get: mock.read, update: mock.write }
    }
  }
}));
import { interfacePreferences } from "./interface-preferences";
import { GUEST_LOCALE_COOKIE } from "@/i18n/snapshot";
beforeEach(() => {
  localStorage.clear();
  document.cookie = `${GUEST_LOCALE_COOKIE}=; Path=/; Max-Age=0`;
  mock.accountId = null;
  mock.generation++;
  vi.clearAllMocks();
  mock.capabilities.mockResolvedValue({
    schema_version: 1,
    preference_version: 1,
    default_locale: "zh-Hans",
    supported_locales: ["zh-Hans", "en-GB"]
  });
  mock.read.mockResolvedValue({ preferences: { interface_locale: null } });
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["zh-Hans"]);
});
it("cookie 只作为访客缓存提示；账号既不读取该提示也不被自动写入偏好", async () => {
  document.cookie = `${GUEST_LOCALE_COOKIE}=en-GB; Path=/`;
  await interfacePreferences.refresh();
  expect(interfacePreferences.getSnapshot().locale).toBe("en-GB");
  expect(mock.read).not.toHaveBeenCalled();
  mock.accountId = "account-a";
  mock.generation++;
  await interfacePreferences.refresh();
  expect(interfacePreferences.getSnapshot().locale).toBe("zh-Hans");
  expect(mock.read).toHaveBeenCalledTimes(1);
  expect(mock.write).not.toHaveBeenCalled();
  expect(
    localStorage.getItem(interfaceLocaleStorageKey("web", "account-a"))
  ).toBeNull();
  expect(document.cookie).toContain("en-GB");
});
it("损坏或别名 cookie 不自动匹配成可保存语言", async () => {
  document.cookie = `${GUEST_LOCALE_COOKIE}=en; Path=/`;
  await interfacePreferences.refresh();
  expect(interfacePreferences.getSnapshot().locale).toBe("zh-Hans");
  expect(interfacePreferences.getSnapshot().preference).toBeNull();
  expect(mock.write).not.toHaveBeenCalled();
});

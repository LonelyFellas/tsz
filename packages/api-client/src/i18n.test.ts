import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpClient, HttpError } from "./http";
import {
  createInterfaceCapabilitiesEndpoint,
  createUserInterfacePreferencesEndpoints,
  decodeInterfaceCapabilities,
  decodeInterfaceLocale
} from "./i18n";
const directory = {
  schema_version: 1,
  preference_version: 1,
  default_locale: "zh-Hans",
  supported_locales: ["zh-Hans"]
};
afterEach(() => vi.restoreAllMocks());
describe("国际化wire与请求", () => {
  it("拒绝未知版本、非法默认值与语言列表，不用畸形响应开放能力", () => {
    expect(decodeInterfaceCapabilities(directory)).toEqual(directory);
    for (const value of [
      { ...directory, schema_version: 2 },
      { ...directory, preference_version: 2 },
      { ...directory, supported_locales: [] },
      { ...directory, supported_locales: ["zh-Hans", "zh-Hans"] },
      { ...directory, default_locale: "en-US" },
      { ...directory, supported_locales: ["ja"] }
    ]) {
      expect(() => decodeInterfaceCapabilities(value)).toThrow();
    }
    for (const value of [undefined, "zh-CN", {}, 1])
      expect(() => decodeInterfaceLocale(value)).toThrow();
  });
  it("公开目录不携带身份或触发刷新，私有偏好保持本人路径和nullable", async () => {
    const refresh = vi.fn();
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (url, init) =>
        new Response(
          JSON.stringify(
            String(url).includes("capabilities")
              ? directory
              : {
                  preferences: {
                    interface_locale:
                      init?.method === "PATCH"
                        ? JSON.parse(init.body as string).interface_locale
                        : null
                  }
                }
          ),
          { status: 200 }
        )
    );
    const http = createHttpClient({
      baseUrl: "/api/v1",
      getToken: () => "private",
      onRefresh: refresh
    });
    await createInterfaceCapabilitiesEndpoint(http)("web");
    expect(
      new Headers(fetch.mock.calls[0]?.[1]?.headers).has("Authorization")
    ).toBe(false);
    const prefs = createUserInterfacePreferencesEndpoints(http);
    await prefs.get();
    await prefs.update({ interface_locale: null });
    expect(fetch.mock.calls[1]?.[0]).toBe("/api/v1/me/preferences");
    expect(
      new Headers(fetch.mock.calls[1]?.[1]?.headers).get("Authorization")
    ).toBe("Bearer private");
    expect(JSON.parse(fetch.mock.calls[2]?.[1]?.body as string)).toEqual({
      interface_locale: null
    });
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "invalid_token", detail: "bad" }), {
        status: 401
      })
    );
    await expect(
      createInterfaceCapabilitiesEndpoint(http)("web")
    ).rejects.toBeInstanceOf(HttpError);
    expect(refresh).not.toHaveBeenCalled();
  });
});

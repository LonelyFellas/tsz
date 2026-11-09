import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  hint: undefined as string | undefined,
  acceptLanguage: ""
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "accept-language": mocks.acceptLanguage }),
  cookies: async () => {
    const hint = mocks.hint;
    return { get: () => (hint ? { value: hint } : undefined) };
  }
}));
import { getWebLocale, getServerWebText } from "./server";
import { webApp } from "./messages/app";
const directory = {
  schema_version: 1,
  preference_version: 1,
  default_locale: "zh-Hans",
  supported_locales: ["zh-Hans", "zh-Hant", "en-GB", "en-US"]
};
beforeEach(() => {
  mocks.hint = undefined;
  mocks.acceptLanguage = "";
  vi.unstubAllGlobals();
});

describe("Web 请求语言输入", () => {
  it("逐请求读取目录，精确标签且不使用浏览器自动猜测", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(directory));
    vi.stubGlobal("fetch", fetcher);
    mocks.hint = "en-US";
    expect(await getWebLocale()).toBe("en-US");
    mocks.hint = "zh-TW";
    expect(await getWebLocale()).toBe("zh-Hans");
    mocks.hint = "en-GB";
    expect(await getWebLocale()).toBe("en-GB");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
  });
  it.each([404, 405, 503])(
    "目录 %s 与停用语言均安全回退，不信任 cookie 开放语言",
    async (status) => {
      mocks.hint = "en-US";
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(null, { status }))
      );
      expect(await getWebLocale()).toBe("zh-Hans");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({ ...directory, supported_locales: ["zh-Hans"] })
        )
      );
      expect(await getWebLocale()).toBe("zh-Hans");
    }
  );
  it("并发服务端翻译实例与输入互相隔离", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(directory))
    );
    mocks.hint = "en-GB";
    const first = getServerWebText(webApp);
    mocks.hint = "zh-Hant";
    const second = getServerWebText(webApp);
    const [english, traditional] = await Promise.all([first, second]);
    expect(english("登录")).toBe("Sign in");
    expect(traditional("登录")).toBe("登入");
    expect(english("登录")).toBe("Sign in");
  });
});

it("英文浏览器首访按权重与客户端相同规则匹配，停用项不启用", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(directory))
  );
  mocks.acceptLanguage = "fr;q=1, en-US;q=0.9, en-GB;q=0.8";
  expect(await getWebLocale()).toBe("en-US");
  mocks.hint = "zh-Hant";
  expect(await getWebLocale()).toBe("zh-Hant");
  mocks.hint = undefined;
  mocks.acceptLanguage = "en-US;q=0, en-GB;q=0.7";
  expect(await getWebLocale()).toBe("en-GB");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ ...directory, supported_locales: ["zh-Hans"] })
    )
  );
  expect(await getWebLocale()).toBe("zh-Hans");
});

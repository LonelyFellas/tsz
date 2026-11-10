import { describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import type { InterfaceCapabilities } from "@tsz/types";
import {
  createInterfacePreferences,
  interfaceLocaleStorageKey
} from "./preferences";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const directory: InterfaceCapabilities = {
  schema_version: 1,
  preference_version: 1,
  default_locale: "zh-Hans",
  supported_locales: ["zh-Hans", "en-US"]
};
function fixture() {
  let session = { accountId: "a" as string | null, generation: 1 };
  const values = new Map<string, string>();
  const options = {
    surface: "web" as const,
    getSession: () => session,
    capabilities: vi.fn(async () => directory),
    read: vi.fn(async (): Promise<"zh-Hans" | "en-US" | null> => null),
    write: vi.fn(
      async (locale: "zh-Hans" | "en-US" | "zh-Hant" | "en-GB" | null) => locale
    ),
    getStorage: () => ({
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      }
    }),
    browserLanguages: () => ["zh-CN"]
  };
  return {
    options,
    values,
    session: (id: string | null, generation: number) => {
      session = { accountId: id, generation };
    },
    controller: createInterfacePreferences(options)
  };
}

describe("账号界面偏好", () => {
  it("公开链接语言受目录约束，账号显式偏好优先且不写回账号", async () => {
    const f = fixture();
    let hint = "en-US";
    const controller = createInterfacePreferences({
      ...f.options,
      getPublicLocale: () => hint
    });
    f.session(null, 1);
    f.values.set(interfaceLocaleStorageKey("web", "guest"), "zh-Hans");
    await controller.refresh();
    expect(controller.getSnapshot().locale).toBe("en-US");
    f.session("a", 2);
    f.options.read.mockResolvedValueOnce("zh-Hans");
    await controller.refresh();
    expect(controller.getSnapshot().locale).toBe("zh-Hans");
    expect(f.options.write).not.toHaveBeenCalled();
    f.session("b", 3);
    await controller.refresh();
    expect(controller.getSnapshot().locale).toBe("en-US");
    expect(controller.getSnapshot().preference).toBeNull();
    hint = "zh-Hant";
    await controller.refresh();
    expect(controller.getSnapshot().locale).toBe("zh-Hans");
  });
  it("访客选择独立持久化，不调用私有 API 或复制到登录账号", async () => {
    const f = fixture();
    f.session(null, 1);
    await f.controller.refresh();
    await f.controller.saveGuest("en-US");
    await f.controller.refresh();
    expect(f.controller.getSnapshot().locale).toBe("en-US");
    expect(f.options.read).not.toHaveBeenCalled();
    expect(f.options.write).not.toHaveBeenCalled();
    expect(f.values.get(interfaceLocaleStorageKey("web", "guest"))).toBe(
      "en-US"
    );
    f.session("a", 2);
    await f.controller.refresh();
    expect(f.controller.getSnapshot().locale).toBe("zh-Hans");
    await expect(f.controller.saveGuest("en-US")).rejects.toThrow();
    await f.controller.save("en-US");
    f.session(null, 3);
    await f.controller.refresh();
    await f.controller.saveGuest(null);
    expect(f.controller.getSnapshot().locale).toBe("zh-Hans");
    expect(f.values.get(interfaceLocaleStorageKey("web", "a"))).toBe("en-US");
    expect(f.values.has(interfaceLocaleStorageKey("web", "guest"))).toBe(false);
  });

  it("访客存储不可用时在本次页面内保留选择，清除后不复用旧缓存", async () => {
    const f = fixture();
    f.session(null, 1);
    f.values.set(interfaceLocaleStorageKey("web", "guest"), "en-US");
    f.options.getStorage = () => {
      throw new Error("storage disabled");
    };
    const controller = createInterfacePreferences(f.options);
    await controller.refresh();
    await controller.saveGuest("en-US");
    await controller.refresh();
    expect(controller.getSnapshot().locale).toBe("en-US");
    await controller.saveGuest(null);
    await controller.refresh();
    expect(controller.getSnapshot().locale).toBe("zh-Hans");
    expect(f.options.write).not.toHaveBeenCalled();
  });

  it("重新核对目录时保留当前语言并禁写；收缩后回退但不改写已存偏好", async () => {
    const f = fixture();
    f.options.read.mockResolvedValue("en-US");
    await f.controller.refresh();
    const response = deferred<InterfaceCapabilities>();
    f.options.capabilities.mockImplementationOnce(() => response.promise);
    const refreshing = f.controller.refresh();
    expect(f.controller.getSnapshot()).toMatchObject({
      locale: "en-US",
      refreshing: true
    });
    await expect(f.controller.save(null)).rejects.toThrow();
    response.resolve({ ...directory, supported_locales: ["zh-Hans"] });
    await refreshing;
    expect(f.controller.getSnapshot()).toMatchObject({
      locale: "zh-Hans",
      preference: "en-US",
      refreshing: false
    });
    expect(f.options.write).not.toHaveBeenCalled();
  });

  it("保存尚未发出就换号时，不得使用新账号会话执行旧账号操作", async () => {
    const f = fixture();
    await f.controller.refresh();
    const saving = f.controller.save("en-US");
    f.session("b", 2);
    await expect(saving).rejects.toThrow("会话已变化");
    expect(f.options.write).not.toHaveBeenCalled();
    expect(f.values.size).toBe(0);
  });
  it("保存结果未知时，等待中的回读仍确认服务端最终值而不产生未处理拒绝", async () => {
    const f = fixture();
    await f.controller.refresh();
    const response = deferred<"en-US">();
    f.options.write.mockImplementationOnce(() => response.promise);
    const saving = f.controller.save("en-US");
    const reading = f.controller.refresh();
    f.options.read.mockResolvedValue("en-US");
    response.reject(new Error("connection lost after commit"));
    await expect(saving).rejects.toThrow();
    await reading;
    expect(f.controller.getSnapshot().preference).toBe("en-US");
  });
  it("只按目录开放语言，清除成功才移除本人缓存，访客不能写入", async () => {
    const f = fixture();
    await f.controller.refresh();
    expect(f.controller.getSnapshot().locale).toBe("zh-Hans");
    await expect(f.controller.save("zh-Hant")).rejects.toThrow("尚未开放");
    expect(f.options.write).not.toHaveBeenCalled();
    await f.controller.save("en-US");
    expect(f.values.get(interfaceLocaleStorageKey("web", "a"))).toBe("en-US");
    expect(f.controller.getSnapshot().locale).toBe("en-US");
    await f.controller.save(null);
    expect(f.values.size).toBe(0);
    expect(f.controller.getSnapshot().preference).toBeNull();
    f.session(null, 2);
    await f.controller.refresh();
    await expect(f.controller.save("zh-Hans")).rejects.toThrow();
  });

  it("旧目录404/405不读写偏好，网络异常与目录声明后的缺端点分别为错误", async () => {
    for (const status of [404, 405, 503]) {
      const f = fixture();
      f.options.capabilities.mockRejectedValue(new HttpError(status, "failed"));
      await f.controller.refresh();
      expect(f.controller.getSnapshot().status).toBe(
        status === 503 ? "error" : "unsupported"
      );
      expect(f.controller.getSnapshot().locale).toBe("zh-Hans");
      expect(f.options.read).not.toHaveBeenCalled();
      await expect(f.controller.save("zh-Hans")).rejects.toThrow();
      expect(f.options.write).not.toHaveBeenCalled();
    }
    const f = fixture();
    f.options.read.mockRejectedValue(new HttpError(404, "missing"));
    await f.controller.refresh();
    expect(f.controller.getSnapshot().status).toBe("error");
  });

  it("同一字段拒绝重叠保存，失败保留旧值，缓存故障不改变成功结果", async () => {
    const f = fixture();
    await f.controller.refresh();
    const response = deferred<"en-US">();
    f.options.write.mockImplementationOnce(() => response.promise);
    const saving = f.controller.save("en-US");
    await expect(f.controller.save(null)).rejects.toThrow("正在保存");
    response.reject(new Error("network"));
    await expect(saving).rejects.toThrow("network");
    expect(f.controller.getSnapshot().preference).toBeNull();
    f.options.getStorage = () => {
      throw new Error("disabled");
    };
    // 新实例使用同一账号和请求适配，验证存储不可用。
    const offline = createInterfacePreferences(f.options);
    await offline.refresh();
    await offline.save("en-US");
    expect(offline.getSnapshot().preference).toBe("en-US");
  });

  it("换号或同账号新会话丢弃迟到的读取和保存，缓存也不能串用", async () => {
    for (const nextId of ["a", "b"]) {
      const f = fixture();
      await f.controller.refresh();
      const response = deferred<"en-US">();
      f.options.write.mockImplementationOnce(() => response.promise);
      const saving = f.controller.save("en-US");
      await Promise.resolve();
      expect(f.options.write).toHaveBeenCalledOnce();
      f.session(nextId, 2);
      await f.controller.refresh();
      response.resolve("en-US");
      await expect(saving).rejects.toThrow("会话已变化");
      expect(f.controller.getSnapshot().preference).toBeNull();
      expect(f.values.size).toBe(0);
    }
    const f = fixture();
    const late = deferred<null>();
    f.options.read.mockImplementationOnce(() => late.promise);
    const reading = f.controller.refresh();
    await Promise.resolve();
    f.session("b", 2);
    await f.controller.refresh();
    await f.controller.save("en-US");
    late.resolve(null);
    await reading;
    expect(f.controller.getSnapshot().preference).toBe("en-US");
    expect(f.values.has(interfaceLocaleStorageKey("web", "a"))).toBe(false);
  });

  it("初始读取与旧刷新均不能覆盖较新保存，保存中刷新等待最终回读", async () => {
    const f = fixture();
    const late = deferred<null>();
    f.options.read.mockImplementationOnce(() => late.promise);
    const reading = f.controller.refresh();
    await Promise.resolve();
    await f.controller.refresh();
    await f.controller.save("en-US");
    late.resolve(null);
    await reading;
    expect(f.controller.getSnapshot().preference).toBe("en-US");
    const saved = deferred<"en-US">();
    f.options.write.mockImplementationOnce(() => saved.promise);
    const writing = f.controller.save("en-US");
    const refreshing = f.controller.refresh();
    f.options.read.mockResolvedValue("en-US");
    saved.resolve("en-US");
    await writing;
    await refreshing;
    expect(f.controller.getSnapshot().preference).toBe("en-US");
  });
});

it("exposes only the current identity's verified request language", async () => {
  const f = fixture();
  expect(f.controller.getRequestLocale()).toBeUndefined();
  await f.controller.refresh();
  await f.controller.save("en-US");
  expect(f.controller.getRequestLocale()).toBe("en-US");
  f.session("b", 2);
  expect(f.controller.getRequestLocale()).toBeUndefined();
  await f.controller.refresh();
  expect(f.controller.getRequestLocale()).toBe("zh-Hans");
  f.options.capabilities.mockRejectedValue(new Error("offline"));
  await f.controller.refresh();
  expect(f.controller.getRequestLocale()).toBeUndefined();
});

it("同身份短暂目录或偏好读取失败保留已确认语言，换号与目录停用仍重新决定", async () => {
  const f = fixture();
  f.options.read.mockResolvedValue("en-US");
  await f.controller.refresh();
  f.options.capabilities.mockRejectedValueOnce(new Error("offline"));
  await f.controller.refresh();
  expect(f.controller.getSnapshot()).toMatchObject({
    locale: "en-US",
    status: "error",
    refreshing: false
  });
  f.options.read.mockRejectedValueOnce(new Error("offline"));
  await f.controller.refresh();
  expect(f.controller.getSnapshot().locale).toBe("en-US");
  f.options.capabilities.mockResolvedValue({
    ...directory,
    supported_locales: ["zh-Hans"]
  });
  f.options.read.mockRejectedValueOnce(new Error("offline"));
  await f.controller.refresh();
  expect(f.controller.getSnapshot().locale).toBe("zh-Hans");
  f.session("b", 2);
  f.options.capabilities.mockRejectedValueOnce(new Error("offline"));
  await f.controller.refresh();
  expect(f.controller.getSnapshot()).toMatchObject({
    locale: "zh-Hans",
    preference: null
  });
});

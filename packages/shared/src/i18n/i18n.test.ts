import { describe, expect, it } from "vitest";
import {
  createInterfaceI18n,
  formatInterfaceDateTime,
  formatInterfaceNumber,
  normalizeInterfaceLocale,
  resolveInterfaceLocale
} from "./index";

describe("界面语言匹配", () => {
  it.each([
    ["zh-CN", "zh-Hans"],
    ["zh-SG", "zh-Hans"],
    ["zh-TW", "zh-Hant"],
    ["zh-HK", "zh-Hant"],
    ["zh-Hans-TW", "zh-Hans"],
    ["zh-Hant-CN", "zh-Hant"],
    ["EN-us", "en-US"],
    ["en-AU", "en-GB"],
    ["en", "en-GB"]
  ])("将 %s 匹配为 %s，显式文字优先于地区", (input, expected) => {
    expect(normalizeInterfaceLocale(input)).toBe(expected);
  });

  it("跳过不支持或损坏的候选，按调用方优先级选择", () => {
    for (const input of [
      null,
      {},
      "",
      "zh_CN",
      "en-US,en;q=0.9",
      "ja",
      "zh-Latn"
    ]) {
      expect(normalizeInterfaceLocale(input)).toBeUndefined();
    }
    expect(resolveInterfaceLocale("ja", "zh_CN", "en-US", "zh-TW")).toBe(
      "en-US"
    );
    expect(resolveInterfaceLocale("zh-TW", "en-US")).toBe("zh-Hant");
    expect(resolveInterfaceLocale()).toBe("zh-Hans");
  });
});

describe("独立翻译实例", () => {
  it("应用命名空间按实例注入，不污染公共资源或另一应用", () => {
    const extra = {
      en: { example: { title: "Account" } },
      "zh-Hans": { example: { title: "账号" } }
    };
    const first = createInterfaceI18n("en-US", extra);
    expect(first.getResource("en", "example", "title")).toBe("Account");
    first.addResource("en", "example", "title", "Changed");
    expect(extra.en.example.title).toBe("Account");
    expect(
      createInterfaceI18n("en-US").hasResourceBundle("en", "example")
    ).toBe(false);
    expect(first.t("actions.save")).toBe("Save");
  });
  it("同步准备默认中文，不依赖浏览器检测或网络", () => {
    const instance = createInterfaceI18n();
    expect(instance.isInitialized).toBe(true);
    expect(instance.language).toBe("zh-Hans");
    expect(instance.t("actions.save")).toBe("保存");
    expect(createInterfaceI18n("ja").t("actions.save")).toBe("保存");
  });

  it("英美共用英文并应用复数和插值", () => {
    const instance = createInterfaceI18n("en-US");
    expect(instance.t("pagination.item_count", { count: 1 })).toBe("1 item");
    expect(instance.t("pagination.item_count", { count: 2 })).toBe("2 items");
    expect(instance.t("pagination.page", { page: 3 })).toBe("Page 3");
    expect(
      createInterfaceI18n("zh-Hant").t("pagination.item_count", { count: 2 })
    ).toBe("共 2 項");
  });

  it("地区覆盖优先于基础英文，缺失和空白回退到可用资源", () => {
    const instance = createInterfaceI18n("en-US");
    instance.addResourceBundle("en-US", "common", {
      actions: { save: "Save changes", cancel: "" }
    });
    expect(instance.t("actions.save")).toBe("Save changes");
    expect(instance.t("actions.cancel")).toBe("Cancel");
    instance.removeResourceBundle("en", "common");
    expect(instance.t("actions.retry")).toBe("重试");
    const traditional = createInterfaceI18n("zh-Hant");
    traditional.removeResourceBundle("zh-Hant", "common");
    expect(traditional.t("actions.save")).toBe("保存");
  });

  it("一个请求的语言与资源修改不会影响另一实例或后续请求", async () => {
    const first = createInterfaceI18n("en-GB");
    const second = createInterfaceI18n("en-US");
    first.addResourceBundle(
      "en",
      "common",
      { actions: { save: "Changed" } },
      true,
      true
    );
    expect(second.t("actions.save")).toBe("Save");
    expect(createInterfaceI18n("en-GB").t("actions.save")).toBe("Save");
    await first.changeLanguage("zh-Hant");
    expect(first.t("actions.save")).toBe("儲存");
    expect(second.language).toBe("en-US");
    expect(second.t("actions.save")).toBe("Save");
  });
});

describe("界面格式化", () => {
  it("按显式语言格式化数值，保留大整数精度", () => {
    expect(formatInterfaceNumber(1234.5)).toBe("1,234.5");
    expect(formatInterfaceNumber(9007199254740993n, "en-US")).toBe(
      "9,007,199,254,740,993"
    );
  });

  it("切换语言不改变显式时区或日期值", () => {
    const date = new Date("2026-11-08T00:30:00Z");
    for (const locale of ["zh-Hans", "en-GB", "en-US"] as const) {
      expect(
        formatInterfaceDateTime(date, locale, {
          timeZone: "Asia/Singapore",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23"
        })
      ).toBe("08:30");
      expect(
        formatInterfaceDateTime(date, locale, {
          timeZone: "UTC",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23"
        })
      ).toBe("00:30");
    }
    expect(date.toISOString()).toBe("2026-11-08T00:30:00.000Z");
  });
});

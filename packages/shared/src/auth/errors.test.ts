import { describe, expect, it } from "vitest";
import { translateAuthError } from "./errors";

describe("translateAuthError", () => {
  it("优先用调用方传入的映射", () => {
    expect(
      translateAuthError(
        "invalid credentials",
        {
          "invalid credentials": "账号或密码错误"
        },
        "兜底"
      )
    ).toBe("账号或密码错误");
  });

  it("回退到通用会话错误映射", () => {
    expect(translateAuthError("session expired", {}, "兜底")).toBe(
      "登录已过期，请重新登录"
    );
  });

  it("大小写 / 首尾空白不敏感", () => {
    expect(translateAuthError("  Session Expired  ", {}, "兜底")).toBe(
      "登录已过期，请重新登录"
    );
  });

  it("未知错误回退到原文", () => {
    expect(translateAuthError("weird thing", {}, "兜底")).toBe("weird thing");
  });

  it("空消息回退到兜底文案", () => {
    expect(translateAuthError("", {}, "兜底")).toBe("兜底");
  });
});

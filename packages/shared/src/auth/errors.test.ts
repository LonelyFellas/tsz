import { describe, expect, it } from "vitest";
import { passwordErrorMessage, translateAuthError } from "./errors";

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

  it("后端未实现的端点(404 Not Found)映射为「暂未开放」而非透传英文", () => {
    expect(translateAuthError("Not Found", {}, "兜底")).toBe(
      "该功能暂未开放，敬请期待"
    );
  });

  it("空消息回退到兜底文案", () => {
    expect(translateAuthError("", {}, "兜底")).toBe("兜底");
  });
});

describe("passwordErrorMessage", () => {
  it.each([
    ["password_too_short", "密码至少需要 15 个字符"],
    ["password_too_long", "密码不能超过 128 个字符"],
    ["password_too_weak", "该密码过于常见或容易猜测，请换一个"],
    ["password_compromised", "该密码已出现在泄露记录中，请换一个"]
  ])("稳定翻译 %s", (code, message) => {
    expect(passwordErrorMessage(code)).toBe(message);
  });
  it("不把未知错误伪装成密码策略失败", () => {
    expect(passwordErrorMessage("invalid_token")).toBeUndefined();
  });
});

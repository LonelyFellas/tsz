import { describe, expect, it } from "vitest";
import {
  isCode,
  isEmail,
  isPhone,
  isRegisterPassword,
  isValidAccount
} from "./validate";

describe("isPhone", () => {
  it.each(["13800138000", "15912345678", "19999999999", "17000000000"])(
    "接受合法手机号 %s",
    (v) => {
      expect(isPhone(v)).toBe(true);
    }
  );

  it.each([
    ["", "空串"],
    ["1234567890", "首位非 1 且段错"],
    ["12345678901", "第二位为 2(应为 3-9)"],
    ["1380013800", "只有 10 位"],
    ["138001380000", "12 位过长"],
    ["1380013800a", "含字母"],
    ["23800138000", "首位非 1"],
    [" 13800138000", "前导空格"]
  ])("拒绝 %s(%s)", (v) => {
    expect(isPhone(v)).toBe(false);
  });
});

describe("isEmail", () => {
  it.each(["a@b.com", "user.name@sub.example.cn", "x+tag@y.io"])(
    "接受合法邮箱 %s",
    (v) => {
      expect(isEmail(v)).toBe(true);
    }
  );

  it.each([
    ["", "空串"],
    ["a@b", "缺少顶级域"],
    ["nope", "无 @"],
    ["@b.com", "缺少本地部分"],
    ["a@@b.com", "双 @"],
    ["a b@c.com", "含空格"]
  ])("拒绝 %s(%s)", (v) => {
    expect(isEmail(v)).toBe(false);
  });
});

describe("isValidAccount", () => {
  it("手机号合法即通过", () => {
    expect(isValidAccount("13800138000")).toBe(true);
  });
  it("邮箱合法即通过", () => {
    expect(isValidAccount("a@b.com")).toBe(true);
  });
  it("两者都不合法则拒绝", () => {
    expect(isValidAccount("bad")).toBe(false);
    expect(isValidAccount("")).toBe(false);
  });
});

describe("isCode", () => {
  it.each(["1234", "123456", "12345678"])("接受纯数字验证码 %s", (v) => {
    expect(isCode(v)).toBe(true);
  });

  it.each([
    ["", "空串"],
    ["123", "不足 4 位"],
    ["123456789", "超过 8 位"],
    ["12 34", "含空格"],
    ["12a4", "含字母"]
  ])("拒绝 %s(%s)", (v) => {
    expect(isCode(v)).toBe(false);
  });
});

describe("isRegisterPassword", () => {
  it.each(["abc12345678", "Pass1234word", "aaaaaaaaaa1A"])(
    "接受 11-20 位字母+数字 %s",
    (v) => {
      expect(isRegisterPassword(v)).toBe(true);
    }
  );

  it.each([
    ["", "空串"],
    ["abc1234567", "只有 10 位"],
    ["abc123456789012345678", "超过 20 位"],
    ["abcdefghijk", "缺少数字"],
    ["12345678901", "缺少字母"],
    ["abc1234567!", "含特殊字符"]
  ])("拒绝 %s(%s)", (v) => {
    expect(isRegisterPassword(v)).toBe(false);
  });
});

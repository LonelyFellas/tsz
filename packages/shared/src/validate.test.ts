import { describe, expect, it } from "vitest";
import { isEmail, isPhone, isValidAccount } from "./validate";

describe("isPhone", () => {
  it("接受合法手机号", () => {
    expect(isPhone("13800138000")).toBe(true);
  });
  it("拒绝非法手机号", () => {
    expect(isPhone("12345")).toBe(false);
    expect(isPhone("23800138000")).toBe(false);
  });
});

describe("isEmail", () => {
  it("接受合法邮箱", () => {
    expect(isEmail("a@b.com")).toBe(true);
  });
  it("拒绝非法邮箱", () => {
    expect(isEmail("a@b")).toBe(false);
    expect(isEmail("nope")).toBe(false);
  });
});

describe("isValidAccount", () => {
  it("手机号或邮箱任一合法即可", () => {
    expect(isValidAccount("13800138000")).toBe(true);
    expect(isValidAccount("a@b.com")).toBe(true);
    expect(isValidAccount("bad")).toBe(false);
  });
});
